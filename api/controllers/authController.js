import { Sequelize, Op } from '@sequelize/core'
import User from '../db/models/User'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import GroupUser from '../db/models/GroupUser'
import WebAccount from '../db/models/WebAccount'
import redis from '../utils/redis'

import sequelize from '../db/index.js'
import { getNow } from '../utils/tokens.js'

import { extractCookies } from '../utils/cookies.js'
import { getTokenUntil, verify, extract, verifyAndExtract, verifyMediaToken } from '../utils/tokens.js'

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
        
        if (!receivedToken) return sendJson({ error: 'Wrong Cookie' })
        if (!verify(receivedToken)) return sendJson({ error: 'Wrong Token' })
        
        const { exp, ses } = extract(receivedToken)
        
        const sessionId = parseInt(ses, 10)
        if (isNaN(sessionId)) return sendJson({ error: 'Wrong Session ID' })
        
        const now = Math.floor(Date.now() / 60000)
        const [ atea, rtea ] = getTokenExpirations(now)
        
        const session = await Session.findOne({
            where: {
                id: sessionId,
                disabled: false,
                expiresAt: {[Sequelize.Op.gt]: now}
            }, 
            include: 'user'
        })
        if (!session) return sendJson({ error: 'Wrong Session' })
        
        let update = false;
        
        if (!session.history.some(e => e.ip === request.ip)) {
            session.history.push({ at: now, ip: request.ip });
            if (session.history.length > 20) {
                session.history = session.history.slice(session.history.length - 20);
            }
            session.changed('history', true);
            update = true;
        }
        
        // TODO fix this weird code
        if (session.expiresAt < now + 60 * 24 * 7) {
            session.expiresAt = rtea
            update = true;
        }
        
        if (update) await session.save();
        
        // TODO more detailed info
        if (session === null) return sendJson({ error: "Token Expired" })
        
        return sendTokens(session.user, session, atea, rtea)
    }
    
    async login(request) {
        if(!await checkRateLimit(request.ip, "login")) return sendJson({ error: 'Rate Limit' })
        const { email, password, fingerprint } = await request.json()
        
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
        
        return await this.createSession(user, fingerprint, request.ip)
    }

    async logout(request, sessionId) {
        const { userId } = request;
        const canAccessAllSessions = request.access === "ALL"
        
        if(!canAccessAllSessions) {
            if(!sessionId) return sendJson({ error: 'No Access' })
            
            if(!userId) return sendJson({ error: 'No Access' })
            
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
    async createSession(user, fingerprint, ip) {
        const now = Math.floor(Date.now() / 60000)
        const [ atea, rtea ] = getTokenExpirations(now)
        
        // session.id будет в 
        const session = await user.createSession({
            expiresAt: rtea,
            history: [{
                at: now,
                ip,
                val: fingerprint.slice(0, 32)
            }] // TODO extensive device info
        })
        // TODO ratelimits
        
        return sendTokens(user, session, atea, rtea)
    }
    
    /*
    // Получение медиа-токена
    // Позволяет просматривать все видеопотоки из группы, указанной в токене
    */
    async allowMediaAccess(request) {
        const data = await request.json()
        // ВНИМАНИЕ! Нельзя открывать порт 8554
        if(data.action === "publish" && data.protocol === "rtsp") return new Response("", { status: 200 })
        const token = data.token
        const path = data.path.split('/')
        
        const [ groupIdStr, _unixMinute, signature ] = token.split('-')
        if (!signature) return new Response("", { status: 403 })
        
        if(path[0] !== groupIdStr) {
            console.log('Группа в токене не совпала')
            return new Response("", { status: 403 })
        }
        
        const unixMinute = parseInt(_unixMinute, 10)
        if (isNaN(unixMinute)) {
            console.log('unixMinute = NaN')
            return new Response("", { status: 403 })
        }
        
        if (getNow() - _unixMinute > 2) return false
        
        const verified = verifyMediaToken(token, groupIdStr, unixMinute)
        return new Response("", { status: verified ? 200 : 403 })
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
        
        // TODO продумать систему access
        // с предоставлением доступов прямо в токене
        
        try {
            const payload = verifyAndExtract(token)
            
            if(!payload) return sendJson({ error: 'Wrong Token' })
            
            const { usr, ses } = payload
            
            // TODO fingerprint verifying
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
            
            request.userId = usr
            
            // TODO error is being handled in wrong place (should not be in authenticate function)
            return controllerEndpoint(request, args)
        } catch (e) {
            console.error(e)
            return sendJson({ error: "Internal Error" }, 500)
        }
    }
}

// Access: 10 минут
// Refresh: 14 дней
const getTokenExpirations = now => {
    return [ now + 10, now + 60 * 24 * 14 ]
}

const sendTokens = (user, session, atea, rtea) => {
    const accessT = getTokenUntil(`usr:${user.id},ses:${session.id}`, atea)
    const refreshT = getTokenUntil("ses:" + session.id, rtea)

    const headers = {
            'Set-Cookie': [
    `refreshT=${refreshT}; Path=/; Domain=${process.env.COOKIE_DOMAIN}; Secure; HttpOnly; SameSite=Strict; Max-Age=1209600;`
    ]}

    const userEnt = { id: user.id }
    
    return sendJson({ success: true, session: session.id, token: accessT }, headers)
}

const sendJson = (json, headers) => {
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json', ...headers } })
}

export default AuthController
