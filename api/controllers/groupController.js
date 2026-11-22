import { Sequelize, Op } from '@sequelize/core'
import User from '../db/models/User'
import Group from '../db/models/Group'
import GroupUser from '../db/models/GroupUser'
import Camera from '../db/models/Camera'
import WebAccount from '../db/models/WebAccount'
import TelegramAccount from '../db/models/TelegramAccount'

import redis from '../utils/redis'
import { createMediaToken } from '../utils/tokens'

const GroupController = new class GroupController {
    async create(request) {
        if(request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
        const { name } = await request.json()
        if (!name) return sendJson({ error: 'Name is required' }, 400)
        
        const groupEntity = await Group.create({ name })
        const group = groupEntity.get({ plain: true })
        return sendJson(group)
    }
    
    async get(request, [ url, requestedGroupId ]) {
        const { userId, access } = request
        let currentGroupUser = null

        if (access !== "ALL") {
            if (!requestedGroupId) return sendJson({ error: 'No Access' })
            currentGroupUser = await GroupUser.findOne({ where: { userId, groupId: requestedGroupId }, include: 'group' })
            if (!currentGroupUser) return sendJson({ error: 'No Access' }, 403)
            if (currentGroupUser.expiresAt && new Date(currentGroupUser.expiresAt) <= new Date()) {
                return sendJson({ error: 'Срок действия доступа к группе истек', expired: true }, 403)
            }
        }

        const params = url.searchParams
        const fields = params.get('fields')?.split(',')
        const groups = await Group.findAll({
            where: requestedGroupId ? { id: requestedGroupId } : {},
            include: [
                fields?.includes('cameras') && { model: Camera, as: 'cameras' },
                fields?.includes('users') && { model: User, as: 'users' }
            ].filter(Boolean)
        })

        const maxExpSec = currentGroupUser?.expiresAt ? Math.floor(new Date(currentGroupUser.expiresAt).getTime() / 1000) : null

        const result = await Promise.all(groups.map(async group => {
            const entry = { id: group.id, name: group.name }

            if (fields?.includes('cameras')) {
                if(group.cameras && group.cameras.length) {
                    const token = createMediaToken(group.id, userId, maxExpSec)
                    const cached = await redis.mGet(group.cameras.map(cam => `source:${group.id}/${cam.id}`))
                    const hlsBase = (process.env.HLS_PATH || '/stream/').replace(/\/+$/, '') + '/'
                    entry.cameras = group.cameras.map((cam, i) => {
                        const media = JSON.parse(cam.media)
                        media[0].url = hlsBase + group.id + '/' + cam.id
                        return { id: cam.id, name: cam.name, media, token, ready: JSON.parse(cached[i] || "{}").ready }
                    })
                } else entry.cameras = []
            }

            if (fields?.includes('users')) {
                if(group.users && group.users.length) {
                    const activeUsers = group.users.filter(u => !u.GroupUser.expiresAt || new Date(u.GroupUser.expiresAt) > new Date())
                    if (activeUsers.length) {
                        const cached = await redis.mGet(activeUsers.map(u => 'online:' + u.id))
                        entry.users = activeUsers.map((u, i) => ({
                            id: u.GroupUser.id,
                            name: u.GroupUser.name,
                            role: u.GroupUser.role,
                            avatar: u.GroupUser.avatar,
                            expiresAt: u.GroupUser.expiresAt,
                            createdAt: u.GroupUser.createdAt,
                            lastSeen: Number(cached[i]) || 0
                        }))
                    } else entry.users = []
                } else entry.users = []
            }

            return entry
        }))
        
        const response = { success: true }
        if(requestedGroupId) response.group = result[0]
        else response.groups = result
        
        return sendJson(response)
    }
    
    async getUsers(request, [url, requestedGroupId]) {
        if (!requestedGroupId) return sendJson({ error: 'Wrong ID' }, 400)
        const { userId, access } = request

        if (access !== "ALL") {
            const groupUser = await GroupUser.findOne({ where: { userId, groupId: requestedGroupId } })
            if (!groupUser) return sendJson({ error: 'No Access' }, 403)
            if (groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
                return sendJson({ error: 'Срок действия доступа к группе истек', expired: true }, 403)
            }
        }

        const params = url.searchParams
        const fields = params.get('fields')?.split(',')
        
        const groupUsers = await GroupUser.findAll({
            where: {
                groupId: requestedGroupId,
                [Op.or]: [
                    { expiresAt: null },
                    { expiresAt: { [Op.gt]: new Date() } }
                ]
            },
            include: [
                fields?.includes('accounts') && {
                    model: User,
                    as: 'users',
                    include: [
                        { model: WebAccount, as: 'webAccount' },
                        { model: TelegramAccount, as: 'telegramAccount' }
                    ]
                }
            ].filter(Boolean)
        })

        const response = { success: true, members: groupUsers }
        
        return sendJson(response)
    }
}

const sendJson = json => {
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } })
}

export default GroupController
