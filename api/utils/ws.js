import { verifyAccessToken } from './tokens'
import redis from './redis'
import GroupUser from '../db/models/GroupUser'
import { Op } from '@sequelize/core'

let bunServer = null
const sessionSockets = new Map()

export function setWsServer(server) {
  bunServer = server
}

export function registerWsSocket(ws) {
  const sessionId = ws.data?.sessionId
  if (!sessionId) return
  if (!sessionSockets.has(sessionId)) {
    sessionSockets.set(sessionId, new Set())
  }
  sessionSockets.get(sessionId).add(ws)
}

export function unregisterWsSocket(ws) {
  const sessionId = ws.data?.sessionId
  if (!sessionId) return
  const set = sessionSockets.get(sessionId)
  if (set) {
    set.delete(ws)
    if (set.size === 0) sessionSockets.delete(sessionId)
  }
}

export function disconnectSession(sessionId) {
  const id = Number(sessionId)
  if (!id) return
  const set = sessionSockets.get(id)
  if (set) {
    console.log(`[WS] Terminating ${set.size} WebSocket connection(s) for revoked session ${id}`)
    for (const ws of set) {
      try {
        ws.send(JSON.stringify({ type: 'auth:revoked' }))
        ws.close(4001, 'Session revoked')
      } catch (e) {}
    }
    sessionSockets.delete(id)
  }
}

export function broadcastToGroup(groupId, eventType, data = {}) {
  if (!bunServer || !groupId) return
  const message = JSON.stringify({ type: eventType, groupId: Number(groupId), ...data })
  bunServer.publish(`group:${groupId}`, message)
}

export function broadcastToUser(userId, eventType, data = {}) {
  if (!bunServer || !userId) return
  const message = JSON.stringify({ type: eventType, ...data })
  bunServer.publish(`user:${userId}`, message)
}

export async function authenticateWs(request) {
  try {
    const url = new URL(request.url)
    let token = url.searchParams.get('token')
    if (!token) {
      const protocols = request.headers.get('sec-websocket-protocol')
      if (protocols) token = protocols.split(',')[0]?.trim()
    }
    if (!token) return null

    const payload = verifyAccessToken(token)
    if (!payload || !payload.userId || !payload.sessionId) return null

    const disabled = await redis.exists('disabled-session-' + payload.sessionId)
    if (disabled) return null

    const userId = Number(payload.userId)
    const sessionId = Number(payload.sessionId)
    const tokenExp = Number(payload.exp)

    const activeGroupUsers = await GroupUser.findAll({
      where: {
        userId,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      attributes: ['groupId']
    })

    const groupIds = activeGroupUsers.map(gu => gu.groupId)
    return { userId, sessionId, tokenExp, groupIds }
  } catch (err) {
    console.error('WS Auth Error:', err)
    return null
  }
}
