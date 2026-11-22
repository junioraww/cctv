import { Sequelize, Op } from '@sequelize/core'
import User from '../db/models/User'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import GroupUser from '../db/models/GroupUser'
import WebAccount from '../db/models/WebAccount'
import redis from '../utils/redis'
import { disconnectSession } from '../utils/ws'

import sequelize from '../db/index.js'
import {
    createAccessToken,
    verifyAccessToken,
    createRefreshToken,
    verifyRefreshToken,
    createMediaToken,
    verifyMediaToken,
    verifyInviteToken,
    getNowSec
} from '../utils/tokens.js'

import { extractCookies } from '../utils/cookies.js'

const onlineCacheThrottle = {}

// TODO вынести в отдельный util (class RateLimit)
const RATE_LIMIT_MAX = 4
const RATE_LIMIT_TTL = 60 * 5

async function checkRateLimit(ip, type) {
    const key = `${type}_fail:${ip}`
    const attempts = await redis.incr(key)
    if (attempts === 1) await redis.expire(key, RATE_LIMIT_TTL)
    return attempts <= RATE_LIMIT_MAX
}

async function resetRateLimit(ip, type) {
    await redis.del(`${type}_fail:${ip}`)
}

const AuthController = new class AuthController {
    /**
    Обновление Access + Refresh токенов
     */
    async refresh(request, url) {
        const receivedToken = extractCookies(request).refreshT
        
        if (!receivedToken) return sendJson({ error: 'Wrong Cookie' }, 401)
        
        const refreshData = verifyRefreshToken(receivedToken)
        if (!refreshData) return sendJson({ error: 'Wrong Token' }, 401)
        
        const sessionId = refreshData.sessionId
        if (isNaN(sessionId)) return sendJson({ error: 'Wrong Session ID' }, 401)
        
        const nowSec = getNowSec()
        const nowMin = Math.floor(Date.now() / 60000)
        const [ atea, rtea ] = getTokenExpirations(nowSec)
        
        const session = await Session.findOne({
            where: {
                id: sessionId,
                disabled: false,
                [Sequelize.Op.or]: [
                    { expiresAt: { [Sequelize.Op.gt]: nowSec } },
                    { expiresAt: { [Sequelize.Op.gt]: nowMin } }
                ]
            }, 
            include: 'user'
        })
        if (!session) return sendJson({ error: 'Wrong Session' }, 401)
        
        let update = false;
        
        if (!session.history.some(e => e.ip === request.ip)) {
            session.history.push({ at: nowSec, ip: request.ip });
            if (session.history.length > 20) {
                session.history = session.history.slice(session.history.length - 20);
            }
            session.changed('history', true);
            update = true;
        }
        
        if (session.expiresAt < nowSec + 7 * 86400) {
            session.expiresAt = rtea
            update = true;
        }
        
        if (update) await session.save();
        
        return sendTokens(session.user, session, atea, rtea)
    }
    
    async login(request) {
        if(!await checkRateLimit(request.ip, "login")) return sendJson({ error: 'Rate Limit' })
        const { email, password, fingerprint, inviteId: bodyInviteId, nonce } = await request.json()
        
        const user = await User.findOne({
            where: { '$webAccount.email$': email },
            include: [{
                model: WebAccount,
                as: 'webAccount'
            }]
        })

        if (!user) return sendJson({ error: 'Неверные данные' })
        if (!await user.webAccount.checkPassword(password)) return sendJson({ error: 'Неверные данные' })
        
        await resetRateLimit(request.ip, "login")

        // Проверяем приглашение из куки или переданное напрямую
        let inviteId = bodyInviteId || null
        if (!inviteId) {
            const inviteCookie = extractCookies(request).invite
            if (inviteCookie) {
                const invData = verifyInviteToken(inviteCookie)
                if (invData) {
                    inviteId = invData.inviteId
                }
            }
        }

        let joinedGroup = null
        const clearInviteCookies = []
        const domain = process.env.COOKIE_DOMAIN?.trim()
        const domainAttr = (domain && !['.domain.com', 'domain.com', '.cam.lisyak.net', '.localhost'].includes(domain)) ? ` Domain=${domain};` : ''

        if (inviteId || nonce) {
            try {
                await sequelize.transaction(async (t) => {
                    let invite = null
                    if (inviteId) {
                        invite = await Invite.findOne({
                            where: { id: inviteId },
                            include: [{ association: 'group' }],
                            lock: t.LOCK.UPDATE,
                            transaction: t
                        })
                    }
                    if (!invite && nonce) {
                        const cleanNonce = String(nonce).match(/[a-fA-F0-9]{8}/)?.[0] || nonce
                        invite = await Invite.findOne({
                            where: { nonce: cleanNonce },
                            include: [{ association: 'group' }],
                            lock: t.LOCK.UPDATE,
                            transaction: t
                        })
                    }

                    if (invite && (!invite.usedById || invite.usedById === user.id)) {
                        const existingGU = await GroupUser.findOne({
                            where: { userId: user.id, groupId: invite.groupId },
                            transaction: t
                        })

                        if (!existingGU) {
                            let expiresAt = null
                            if (invite.isTemporary && invite.durationMinutes > 0) {
                                expiresAt = new Date(Date.now() + invite.durationMinutes * 60000)
                            }
                            await GroupUser.create({
                                userId: user.id,
                                groupId: invite.groupId,
                                name: user.name || 'Участник',
                                avatar: null,
                                expiresAt,
                                role: 0
                            }, { transaction: t })
                        }

                        invite.used = true
                        invite.usedById = user.id
                        await invite.save({ transaction: t })
                        joinedGroup = invite.group
                        clearInviteCookies.push(`invite=; Path=/;${domainAttr} Secure; HttpOnly; SameSite=Lax; Max-Age=0;`)
                    }
                })
            } catch (err) {
                console.error('Ошибка присоединения к группе при входе:', err)
            }
        }
        
        return await this.createSession(user, fingerprint, request.ip, clearInviteCookies, joinedGroup ? { group: { id: joinedGroup.id, name: joinedGroup.name } } : {})
    }

    async logout(request, sessionId) {
        const { userId } = request;
        const canAccessAllSessions = request.access === "ALL"
        
        if (!canAccessAllSessions) {
            if (!sessionId) return sendJson({ error: 'No Access' })
            if (!userId) return sendJson({ error: 'No Access' })
            
            const [ updated ] = await Session.update({
                disabled: true
            }, {
                where: {
                    id: sessionId,
                    userId
                }
            })
            
            if (!updated) return sendJson({ error: 'Not Found' })
            
            await redis.set('disabled-session-' + sessionId , '1', { EX: 60 * 10 })
            disconnectSession(sessionId)
            
            return sendJson({ success: true })
        } else {
            if (!sessionId) return sendJson({ error: 'No Access' })
            
            const [ updated ] = await Session.update({
                disabled: true
            }, {
                where: {
                    id: sessionId
                }
            })
            
            if (!updated) return sendJson({ error: 'Not Found' })
            
            await redis.set('disabled-session-' + sessionId , '1', { EX: 60 * 10 })
            disconnectSession(sessionId)
            
            return sendJson({ success: true })
        }
    }
    
    // TODO
    /*static async sendCode(request) {
        const { email, fingerprint } = await request.json()
        const ip = getIp(request)

        const user = await User.findOne({ where: { '$WebAccount.email$': email }, include: [WebAccount] })
        if (!user) {
            if (!(await checkRateLimit(ip, 'sendcode'))) return sendJson({ error: 'Too many attempts, try later' })
            return sendJson({ error: 'User not found' })
            // user not found = vuln
        }

        await resetRateLimit(ip, 'sendcode')

        const verifyToken = await issueVerifyToken(user.id, email, fingerprint)
        await sendCode(email, verifyToken)
        return sendJson({ verifyToken })
    }

    // TODO
    async verify(request) {
        const { code, verifyToken, fingerprint } = await request.json()
        if (!code || !verifyToken) return sendJson({ error: 'Invalid request' })

        const payload = await checkVerifyToken(verifyToken)
        if (!payload) return sendJson({ error: 'Invalid or expired token' })

        const ok = await checkCode(verifyToken, code)
        if (!ok) return sendJson({ error: 'Invalid code' })

        await WebAccount.update({ verified: true }, { where: { userId: payload.userId } })
        const user = await User.findByPk(payload.userId, { include: [WebAccount] })

        return await createSession(user, fingerprint)
    }*/
    
    /*
    // Авторизация (получение access и refresh)
    */
    async createSession(user, fingerprint, ip, extraCookies = [], extraData = {}) {
        const nowSec = getNowSec()
        const [ atea, rtea ] = getTokenExpirations(nowSec)
        
        const session = await user.createSession({
            expiresAt: rtea,
            history: [{
                at: nowSec,
                ip,
                val: (fingerprint || '').slice(0, 32)
            }]
        })
        
        return sendTokens(user, session, atea, rtea, extraCookies, extraData)
    }
    
    /*
    // Получение медиа-токена
    // Позволяет просматривать все видеопотоки из группы, указанной в токене
    */
    async allowMediaAccess(request) {
        try {
            const data = await request.json()
            if (!data) return new Response("", { status: 403 })
            
            // Allow publishing from internal network (MediaMTX source / ffmpeg)
            if (data.action === "publish") return new Response("", { status: 200 })
            
            const token = data.token || (data.query ? new URLSearchParams(data.query).get('token') : null)
            if (!token || typeof token !== 'string') return new Response("", { status: 403 })
            
            const pathParts = (data.path || "").split('/')
            const requestedGroupId = parseInt(pathParts[0], 10)
            if (isNaN(requestedGroupId)) return new Response("", { status: 403 })

            // 1. Проверяем бинарный Media Token (Схема 3)
            const mediaPayload = verifyMediaToken(token)
            if (mediaPayload) {
                if (mediaPayload.groupId !== requestedGroupId) {
                    console.log('Группа в медиа-токене не совпала:', requestedGroupId, 'vs', mediaPayload.groupId)
                    return new Response("", { status: 403 })
                }
                // Проверка прошла чисто в памяти процессора за 1.7 мкс (0 нагрузки на БД и Redis!)
                return new Response("", { status: 200 })
            }

            // 2. Фолбэк: если передан пользовательский Access Token (Схема 1)
            const accessPayload = verifyAccessToken(token)
            if (accessPayload) {
                const userId = accessPayload.userId
                const groupUser = await GroupUser.findOne({ where: { userId, groupId: requestedGroupId } })
                if (!groupUser) return new Response("", { status: 403 })
                if (groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
                    return new Response("", { status: 403 })
                }
                return new Response("", { status: 200 })
            }

            return new Response("", { status: 403 })
        } catch (e) {
            console.error("Media auth error:", e)
            return new Response("", { status: 403 })
        }
    }

    /*
    // Проверка подлинности пользователя
    */
    async authenticate(request, args, controllerEndpoint) {
        if(request.access === "ALL") return controllerEndpoint(request, args)
        
        const authHeader = request.headers.get('Authorization')
        
        if(!authHeader?.startsWith('Bearer ')) {
            return sendJson({ error: "Invalid Auth Header" }, 405)
        }
        
        const token = authHeader.slice(7)
        
        try {
            const payload = verifyAccessToken(token)
            
            if(!payload) return sendJson({ error: 'Wrong Token' }, 405)
            
            const usr = payload.userId
            const ses = payload.sessionId
            
            if(!usr || !ses) return sendJson({ error: "Wrong Token" }, 405)
            
            const disabled = await redis.exists('disabled-session-' + ses)
            if (disabled) return sendJson({ error: "Logged Out" }, 405)
            
            const second = Math.floor(Date.now() / 1000)
            
            if(second - (onlineCacheThrottle[usr] ?? 0) > 2) {
                onlineCacheThrottle[usr] = second
                redis.multi()
                    .set('online:' + usr, second)
                    .set('active:' + ses, second)
                    .exec();
            }
            
            request.userId = Number(usr)
            request.sessionId = Number(ses)
            
            return controllerEndpoint(request, args)
        } catch (e) {
            console.error(e)
            return sendJson({ error: "Internal Error" }, 500)
        }
    }
}

// Access: 10 минут (600 сек)
// Refresh: 14 дней (14 * 86400 сек)
const getTokenExpirations = nowSec => {
    return [ nowSec + 600, nowSec + 14 * 86400 ]
}

const sendTokens = (user, session, atea, rtea, extraCookies = [], extraData = {}) => {
    const nowSec = getNowSec()
    const accessT = createAccessToken(user.id, session.id, atea - nowSec)
    const refreshT = createRefreshToken(session.id, rtea - nowSec)
    const domain = process.env.COOKIE_DOMAIN?.trim()
    const domainAttr = (domain && !['.domain.com', 'domain.com', '.cam.lisyak.net', '.localhost'].includes(domain)) ? ` Domain=${domain};` : ''

    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.append('Set-Cookie', `refreshT=${refreshT}; Path=/;${domainAttr} Secure; HttpOnly; SameSite=Lax; Max-Age=1209600;`)
    if (Array.isArray(extraCookies)) {
        for (const cookieStr of extraCookies) {
            headers.append('Set-Cookie', cookieStr)
        }
    }

    const payload = {
        success: true,
        session: session.id,
        token: accessT,
        expiresAt: atea,
        ...extraData
    }

    return new Response(JSON.stringify(payload), { headers })
}

const sendJson = (json, statusOrHeaders = 200) => {
    const isStatus = typeof statusOrHeaders === 'number'
    return new Response(JSON.stringify(json), {
        status: isStatus ? statusOrHeaders : 200,
        headers: { 'Content-Type': 'application/json', ...(isStatus ? {} : statusOrHeaders) }
    })
}

export default AuthController
