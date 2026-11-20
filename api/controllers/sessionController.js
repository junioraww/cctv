import Session from '../db/models/Session'
import User from '../db/models/User'
import Invite from '../db/models/Invite'
import Camera from '../db/models/Camera'
import GroupUser from '../db/models/GroupUser'
import Group from '../db/models/Group'
import { getToken } from '../utils/tokens'
import sequelize from '../db/index'
import redis from '../utils/redis'

const SessionController = new class SessionController {
    async get(request, url) {
        const params = url.searchParams;
        const requestedUserId = Number(params.get('userId'))
        
        const canAccessAllSessions = request.access === "ALL"
        
        // TODO respond with cached last online
        if(!canAccessAllSessions) {
            const userId = request.userId
            if(!userId) return sendJson({ error: 'No Access' }, 403)
            
            const user = await User.findOne({
                where: { id: userId },
                include: 'sessions'
            })
            
            if(!user) return sendJson({ error: 'No Access' }, 403)
            
            const response = { success: true, sessions: (user.sessions || []).map(x => {
                return {
                    id: x.id,
                    name: x.name,
                    expiresAt: x.expiresAt,
                    disabled: x.disabled,
                    history: x.history
            } }) }
            
            return sendJson(response)
        }
        else {
            const response = { success: true }
            
            const condition = requestedUserId ? { userId: requestedUserId } : {}
            
            response.sessions = await Session.findAll({
                where: condition,
                raw: true,
            })
            
            return sendJson(response)
        }
    }
}

const sendJson = (json, headers) => {
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json', ...headers } })
}

export default SessionController
