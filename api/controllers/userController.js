import { Sequelize, Transaction, Op } from '@sequelize/core'
import User from '../db/models/User'
import WebAccount from '../db/models/WebAccount'
import TelegramAccount from '../db/models/TelegramAccount'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import Group from '../db/models/Group'
import GroupUser from '../db/models/GroupUser'

import AuthController from './authController.js'

import redis from '../utils/redis'
import { getToken, verify, extract } from '../utils/tokens.js'
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
        
        const isValid = verify(token)
        if (isValid === null) return sendJson({ error: "Expired Token" })
        else if (!isValid) return sendJson({ error: "Invalid Token" })
        
        const { inv, exp } = extract(token)
        
        const invite = await Invite.findOne({
            where: { id: inv }, raw: true
        })
        
        const { groupId } = invite
        
        const { username, email, password, fingerprint } = await request.json()
        
        const existing = await User.findOne({
            where: {
                [Sequelize.Op.or]: [
                    //{ name: username },
                    { '$WebAccount.email$': email }
                ]
            },
            include: [ WebAccount ],
            raw: true
        });
        
        if (existing) {
            return sendJson({ error: 'Occupied Name/Email' });
        }
        
        // TODO one transaction (or 1 raw request)
        const user = await User.create(
          {
            name: username || 'Пользователь',
            webAccount: { email, password },
          },
          {
            include: 'webAccount',
          }
        );
        
        await Invite.update({ usedById: user.id }, { where: { id: +inv } })
        
        await GroupUser.create({
            userId: user.id,
            groupId,
            name: 'Участник',
            role: 0
        })
        
        return await AuthController.createSession(user, fingerprint, request.ip)
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
            through: { attributes: ['id', 'name', 'role', 'avatar', 'createdAt'] }
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
