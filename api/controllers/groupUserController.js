import User from '../db/models/User'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import GroupUser from '../db/models/GroupUser'
import path from 'node:path'
import fs from 'node:fs'

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
        
        const { name } = await request.json()
        
        if(name) {
            if(name.length < 3 || name.length > 24) return sendJson({ error: 'Wrong Length' }, 400)
            await groupUser.update({ name })
        }
        
        return sendJson({ success: true })
    }

    async updateAvatar(request, [ url, groupId ]) {
        const { userId } = request
        
        if (!groupId || !userId) return sendJson({ error: 'No Access' }, 403)
        
        const groupUser = await GroupUser.findOne({ where: { userId, groupId } })
        if (!groupUser) return sendJson({ error: 'No Access' }, 403)
        
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
        
        await groupUser.update({ avatar: `avatars/${filename}` })
        
        return sendJson({ url: `avatars/${filename}` })
    }
}

const sendJson = (json, status = 200) => {
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
}

export default GroupUserController
