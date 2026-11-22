import { Sequelize, Transaction, Op } from '@sequelize/core'
import fs from 'node:fs'
import path from 'node:path'
import User from '../db/models/User'
import WebAccount from '../db/models/WebAccount'
import TelegramAccount from '../db/models/TelegramAccount'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import Group from '../db/models/Group'
import GroupUser from '../db/models/GroupUser'
import sequelize from '../db/index'

import AuthController from './authController.js'

import redis from '../utils/redis'
import { verifyInviteToken } from '../utils/tokens.js'
import { extractCookies } from '../utils/cookies.js'

const UserController = new class UserController {
    /*
    // Создание и получение аккаунта для Telegram бота
    */
    async getOrCreate(request) {
        const { telegramId, name, tag } = await request.json()
        
        const tgAcc = await TelegramAccount.findOne({
            where: { telegramId },
            attributes: [ 'userId' ]
        })
        
        if (!tgAcc) {
            const userEntity = await User.create({ name })
            const user = userEntity.get({ plain: true })
            await TelegramAccount.create({
                userId: user.id,
                telegramId,
                data: JSON.stringify({ name, tag })
            })
            user.justCreated = true;
            return sendJson(user)
        }
        else {
            const user = await User.findOne({
                where: { id: tgAcc.userId },
                raw: true
            })
            return sendJson(user)
        }
    }
    
    /*
    // Создание аккаунта (после сканирования QR кода)
    // TODO email checking, username checking, 
    */
    async create(request) {
        const token = extractCookies(request).invite
        if (!token) return sendJson({ error: "Кука приглашения не найдена. Пожалуйста, откройте ссылку приглашения заново." }, 400)
        
        const inviteData = verifyInviteToken(token)
        if (!inviteData) return sendJson({ error: "Срок действия приглашения истек или токен недействителен" }, 400)
        
        const inviteId = inviteData.inviteId
        if (!inviteId) return sendJson({ error: "Invalid Token" }, 400)
        
        const { username, name, email, password, fingerprint, avatar } = await request.json()
        if (!email || !password) return sendJson({ error: "Email and password are required" }, 400)
        
        const displayName = (name || username || '').trim() || 'Пользователь'

        let savedAvatar = null
        if (avatar && typeof avatar === 'string' && avatar.startsWith('data:image')) {
            try {
                const parts = avatar.split(',')
                const meta = parts[0]
                const base64Data = parts[1]
                let ext = '.jpeg'
                if (meta.includes('png')) ext = '.png'
                else if (meta.includes('webp')) ext = '.webp'
                
                const buffer = Buffer.from(base64Data, 'base64')
                if (buffer.length <= 512 * 1024) {
                    const filename = `${crypto.randomUUID()}${ext}`
                    const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/html/avatars"
                    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
                    const filePath = path.join(UPLOAD_DIR, filename)
                    await Bun.write(filePath, buffer)
                    savedAvatar = `/avatars/${filename}`
                }
            } catch (err) {
                console.error('Ошибка сохранения аватара при регистрации:', err)
            }
        }
        
        try {
            const user = await sequelize.transaction(async (t) => {
                const invite = await Invite.findOne({
                    where: { id: inviteId },
                    lock: t.LOCK.UPDATE,
                    transaction: t
                })
                
                if (!invite) throw new Error('Invite not found')
                if (invite.usedById) throw new Error('Invite already used')
                
                const existing = await User.findOne({
                    where: { '$webAccount.email$': email },
                    include: [ WebAccount ],
                    transaction: t
                })
                
                if (existing) {
                    const passwordOk = await existing.webAccount.checkPassword(password)
                    if (passwordOk) {
                        const existingGU = await GroupUser.findOne({
                            where: { userId: existing.id, groupId: invite.groupId },
                            transaction: t
                        })

                        if (!existingGU) {
                            let groupUserExpiresAt = null
                            if (invite.isTemporary && invite.durationMinutes > 0) {
                                groupUserExpiresAt = new Date(Date.now() + invite.durationMinutes * 60000)
                            }
                            await GroupUser.create({
                                userId: existing.id,
                                groupId: invite.groupId,
                                name: displayName || existing.name,
                                avatar: savedAvatar || null,
                                expiresAt: groupUserExpiresAt,
                                role: 0
                            }, { transaction: t })
                        }

                        invite.usedById = existing.id
                        invite.used = true
                        await invite.save({ transaction: t })
                        return existing
                    } else {
                        throw new Error('Аккаунт с таким Email уже существует. Если это вы, введите верный пароль или перейдите ко входу.')
                    }
                }
                
                const newUser = await User.create(
                  {
                    name: displayName,
                    webAccount: { email, password },
                  },
                  {
                    include: 'webAccount',
                    transaction: t
                  }
                )
                
                invite.usedById = newUser.id
                invite.used = true
                await invite.save({ transaction: t })
                
                let groupUserExpiresAt = null
                if (invite.isTemporary && invite.durationMinutes > 0) {
                    groupUserExpiresAt = new Date(Date.now() + invite.durationMinutes * 60000)
                }

                await GroupUser.create({
                    userId: newUser.id,
                    groupId: invite.groupId,
                    name: displayName,
                    avatar: savedAvatar,
                    expiresAt: groupUserExpiresAt,
                    role: 0
                }, { transaction: t })
                
                return newUser
            })
            
            const domain = process.env.COOKIE_DOMAIN?.trim()
            const domainAttr = (domain && !['.domain.com', 'domain.com', '.cam.lisyak.net', '.localhost'].includes(domain)) ? ` Domain=${domain};` : ''
            const clearInviteCookies = [`invite=; Path=/;${domainAttr} Secure; HttpOnly; SameSite=Lax; Max-Age=0;`]

            return await AuthController.createSession(user, fingerprint, request.ip, clearInviteCookies)
        } catch (err) {
            return sendJson({ error: err.message }, 400)
        }
    }
    
    // TODO объединить get/user и get/group в 1 запрос
    async get(request, [ url, query ]) {
        const { access, userId } = request
        const params = url.searchParams
        const fields = params.get('fields')?.split(',')
        
        const includeSessions = fields?.includes('sessions');
        
        const includeGroupsReq = fields?.includes('groups') ? [{
            model: Group,
            as: 'groups',
            through: { attributes: ['id', 'name', 'role', 'avatar', 'expiresAt', 'createdAt'] }
        }] : []

        const includeAccountsReq = fields?.includes('accounts') ? [
            { model: WebAccount, as: 'webAccount' },
            { model: TelegramAccount, as: 'telegramAccount' }
        ] : []

        const includeSessionsReq = includeSessions ? [
            { model: Session, where: { disabled: false }, as: 'sessions' },
        ] : []

        const include = [...includeGroupsReq, ...includeAccountsReq, ...includeSessionsReq ]

        // /users — вернуть всех пользователей
        if (!query) {
            if (access !== "ALL") return sendJson({ error: 'No Access' })
            const users = await User.findAll({ include })
            return sendJson({
                success: true,
                users: users.map(u => ({
                    id: u.id,
                    name: u.name,
                    ...(fields?.includes('groups') && {
                        groups: u.groups.map(g => ({
                            id: g.id,
                            name: g.name,
                            member: { 
                                id: g.GroupUser.id,
                                name: g.GroupUser.name,
                                role: g.GroupUser.role,
                                avatar: g.GroupUser.avatar,
                                expiresAt: g.GroupUser.expiresAt,
                                createdAt: g.GroupUser.createdAt
                            }
                        }))
                    }),
                    ...(fields?.includes('accounts') && {
                        webAccount: u.webAccount,
                        telegramAccount: u.telegramAccount
                    }),
                    /*...(fields?.includes('sessions') && {
                        sessions: u.sessions,
                    }),*/
                }))
            })
        }

        // /users/me или /users/:ID
        const id = query === 'me' ? userId : Number(query)
        if (access !== "ALL" && id !== userId) return sendJson({ error: 'No Access' })

        const user = await User.findOne({ where: { id }, include })
        if (!user) return sendJson({ error: 'Not Found' })

        const response = {
            success: true,
            user: {
                id: user.id,
                name: user.name,
                ...(fields?.includes('groups') && {
                    groups: user.groups.map(g => {
                        return {
                        id: g.id,
                        name: g.name,
                        member: {
                            id: g.GroupUser.id,
                            name: g.GroupUser.name,
                            role: g.GroupUser.role,
                            avatar: g.GroupUser.avatar,
                            expiresAt: g.GroupUser.expiresAt,
                            createdAt: g.GroupUser.createdAt
                        }
                    }})
                }),
                ...(fields?.includes('accounts') && {
                    webAccounts: user.webAccount,
                    telegramAccounts: user.telegramAccount
                }),
                ...(includeSessions && {
                    sessions: user.sessions.map(s => {
                        return {
                            id: s.id,
                            name: s.name,
                            expiresAt: s.expiresAt,
                            history: s.history,
                        }
                    })
                }),
            }
        }
        
        if (includeSessions) {
            const requestedSessionOnlines = response.user.sessions
                                            .map(s => 'active:' + s.id)
            const cached = await redis.mGet(requestedSessionOnlines)
            cached.forEach((c, i) => {
                response.user.sessions[i].active = Number(cached[i]);
            })
        }
        
        return sendJson(response)
    }

}

const sendJson = (json, headers) => {
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json', ...headers } })
}

export default UserController
