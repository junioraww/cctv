import { Sequelize, Op } from '@sequelize/core'
import User from '../db/models/User'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import GroupUser from '../db/models/GroupUser'
import path from 'node:path'
import fs from 'node:fs'
import { broadcastToGroup, broadcastToUser } from '../utils/ws'

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/html/avatars"

const GroupUserController = new class GroupUserController {
    async addToGroup(request, groupId) {
        if(request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
        try {
            const { userId, name } = await request.json()
            const user = await User.findOne({ where: { id: userId } })
            if (!user) return sendJson({ error: 'User not found' }, 404)
            await user.addGroup(groupId, {
              through: { name: name || 'Участник', role: 0 }
            })
        } catch (e) {
            console.error(e)
            return sendJson({ success: false }, 500)
        }
        return sendJson({ success: true })
    }

    async update(request, [ url, groupId ]) {
        const { userId } = request
        
        if (!groupId || !userId) return sendJson({ error: 'No Access' }, 403)
        
        const groupUser = await GroupUser.findOne({ where: { userId, groupId } })
        if (!groupUser) return sendJson({ error: 'No Access' }, 403)
        if (groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
            return sendJson({ error: 'Срок действия доступа к группе истек' }, 403)
        }
        
        const body = await request.json()
        const { name, avatar } = body
        
        if(name) {
            if(name.length < 2 || name.length > 24) return sendJson({ error: 'Wrong Length' }, 400)
            await groupUser.update({ name })
        }

        if (avatar === null) {
            await groupUser.update({ avatar: null })
        }
        
        broadcastToGroup(groupId, 'member:updated', {
            member: {
                id: groupUser.id,
                userId,
                name: groupUser.name,
                avatar: groupUser.avatar
            }
        })

        return sendJson({ success: true })
    }

    async updateAvatar(request, [ url, groupId ]) {
        const { userId } = request
        
        if (!groupId || !userId) return sendJson({ error: 'No Access' }, 403)
        
        const groupUser = await GroupUser.findOne({ where: { userId, groupId } })
        if (!groupUser) return sendJson({ error: 'No Access' }, 403)
        if (groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
            return sendJson({ error: 'Срок действия доступа к группе истек' }, 403)
        }
        
        const formData = await request.formData()
        const file = formData.get('avatar')
        if (!file || typeof file === 'string') return sendJson({ error: 'No file' }, 400)

        // проверка размера ≤ 512 КБ
        const arrayBuffer = await file.arrayBuffer()
        if (arrayBuffer.byteLength > 512 * 1024) {
            return sendJson({ error: 'File too large (max 512Kb)' }, 400)
        }

        const ext = path.extname(file.name || '').toLowerCase()
        if (!ALLOWED_EXTS.has(ext)) {
            return sendJson({ error: 'Invalid file format. Allowed: JPG, PNG, WEBP' }, 400)
        }

        // Prevent Path Traversal by generating secure random filename
        const filename = `${crypto.randomUUID()}${ext}`
        fs.mkdirSync(UPLOAD_DIR, { recursive: true })
        const filePath = path.join(UPLOAD_DIR, filename)
        await Bun.write(filePath, new Uint8Array(arrayBuffer))
        
        await groupUser.update({ avatar: `/avatars/${filename}` })
        
        broadcastToGroup(groupId, 'member:updated', {
            member: {
                id: groupUser.id,
                userId,
                name: groupUser.name,
                avatar: `/avatars/${filename}`
            }
        })

        return sendJson({ url: `/avatars/${filename}` })
    }

    async deleteAvatar(request, [ url, groupId ]) {
        const { userId } = request
        
        if (!groupId || !userId) return sendJson({ error: 'No Access' }, 403)
        
        const groupUser = await GroupUser.findOne({ where: { userId, groupId } })
        if (!groupUser) return sendJson({ error: 'No Access' }, 403)
        if (groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
            return sendJson({ error: 'Срок действия доступа к группе истек' }, 403)
        }

        await groupUser.update({ avatar: null })

        broadcastToGroup(groupId, 'member:updated', {
            member: {
                id: groupUser.id,
                userId,
                name: groupUser.name,
                avatar: null
            }
        })

        return sendJson({ success: true, url: null })
    }
}

const sendJson = (json, status = 200) => {
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
}

async function checkExpiredAccess() {
    try {
        const expired = await GroupUser.findAll({
            where: {
                expiresAt: {
                    [Op.ne]: null,
                    [Op.lte]: new Date()
                }
            }
        })
        for (const gu of expired) {
            broadcastToUser(gu.userId, 'access:expired', { groupId: gu.groupId })
            broadcastToGroup(gu.groupId, 'member:removed', { memberId: gu.id, userId: gu.userId })
            await gu.destroy()
        }
    } catch (e) {
        console.error('Error checking expired access:', e)
    }
}

setInterval(checkExpiredAccess, 10 * 1000)
setTimeout(checkExpiredAccess, 2 * 1000)

export default GroupUserController
