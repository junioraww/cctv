import 'dotenv/config'
import cp from 'node:child_process'
import path from 'node:path'
import { serve } from 'bun'
import fs from 'node:fs'

import UserController from './controllers/userController'
import SessionController from './controllers/sessionController'
import GroupController from './controllers/groupController'
import GroupUserController from './controllers/groupUserController'
import InviteController from './controllers/inviteController'
import AuthController from './controllers/authController'
import CameraController from './controllers/cameraController'
import DBUtils from './utils/db'
import { setWsServer, authenticateWs, registerWsSocket, unregisterWsSocket } from './utils/ws'
import { verifyAccessToken } from './utils/tokens'
import redis from './utils/redis'

import Token from './db/models/Token'

const API_PORT = process.env.API_PORT;
const API_REDIRECTED_BY = 'nginx';
const MEDIA_PORT = 3034;

const authenticate = AuthController.authenticate;

//test thing
//await Token.destroy({ where: { access: 'ALL' } })
/*const token = await Token.create({ name: 'bot', access: 'ALL', data: crypto.randomUUID().replace(/-/g, '') });console.log(token)*/

/**
 Токены доступа для TG бота
 */

const tokens = new Map()

const initTokens = async() => {
    while(true) {
        try {
            await new Promise(r => setTimeout(r, 500));
            
            const botSecret = process.env.BOT_SECRET || process.env.SECRET
            if (botSecret) {
                await Token.findOrCreate({
                    where: { data: botSecret },
                    defaults: { name: 'bot', access: 'ALL', data: botSecret }
                })
            }
            
            const tokensDao = await Token.findAll({ raw: true })

            tokens.clear()
            tokensDao.forEach(x => { tokens.set(x.data, x.access) })
            
            // Гарантированный доступ для секрета из окружения
            if (process.env.SECRET) tokens.set(process.env.SECRET, 'ALL')
            if (process.env.BOT_SECRET) tokens.set(process.env.BOT_SECRET, 'ALL')
            
            console.log("Токенов доступа:", tokens.size)
            break;
        } catch (e) {
            console.error("Token init retry...", e.message)
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

initTokens();

function isInternalIp(ip) {
    if (!ip) return true;
    const clean = ip.replace(/^::ffff:/, '').trim();
    return clean === '127.0.0.1' ||
           clean === '::1' ||
           clean === 'localhost' ||
           clean.startsWith('172.16.') || clean.startsWith('172.17.') || clean.startsWith('172.18.') ||
           clean.startsWith('172.19.') || clean.startsWith('172.20.') || clean.startsWith('172.21.') ||
           clean.startsWith('172.22.') || clean.startsWith('172.23.') || clean.startsWith('172.24.') ||
           clean.startsWith('172.25.') || clean.startsWith('172.26.') || clean.startsWith('172.27.') ||
           clean.startsWith('172.28.') || clean.startsWith('172.29.') || clean.startsWith('172.30.') ||
           clean.startsWith('172.31.') ||
           clean.startsWith('10.') ||
           clean.startsWith('192.168.');
}

function extractClientIp(request) {
    const cfIp = request.headers.get("cf-connecting-ip");
    if (cfIp && !isInternalIp(cfIp)) return cfIp.trim();

    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
            if (!isInternalIp(p)) {
                return p;
            }
        }
        if (parts.length > 0) return parts[0];
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp && !isInternalIp(realIp)) return realIp.trim();

    return realIp || (forwarded ? forwarded.split(',')[0].trim() : "127.0.0.1");
}

function nginxHandler(request) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    
    // Safely extract client IP from proxy chain headers
    request.ip = extractClientIp(request);
    
    console.log(method, path)
    
    /* Токены доступа */
    const secret = request.headers.get('X-Secret')
    if(secret && tokens.has(secret)) {
        request.access = tokens.get(secret)
    }
    /* ============== */
    
    const arg = path.split('/')
    
    // TODO вынести в ./routes/*
    if (method === 'GET') {
        if (arg[1] === 'groups') {
            if(arg[3] === 'users' && Number(arg[2])) return authenticate(request, [ url, Number(arg[2]) ], GroupController.getUsers)
            else return authenticate(request, [ url, Number(arg[2]) ], GroupController.get)
        }
        else if (arg[1] === 'users') {
            return authenticate(request, [ url, arg[2] ], UserController.get)
        }
        else if (arg[1] === 'cameras') {
            if(!arg[3]) return authenticate(request, [ url, arg[2] ], CameraController.get)
            if (arg[3] === 'timelapse') return authenticate(request, [ url, Number(arg[2]), arg[4] ], CameraController.getTimelapse)
        }
        else if (arg[1] === 'sessions') {
            if(!arg[2]) return authenticate(request, url, SessionController.get)
        }
    }
    else if (method === 'POST') {
        if (arg[1] === 'auth') {
            if (arg[2] === 'login') return AuthController.login(request, url)
            if (arg[2] === 'refresh') return AuthController.refresh(request, url)
        }
        else if(arg[1] === 'users') {
            if (!arg[2]) return UserController.create(request)
            else if (arg[2] === 'getOrCreate') {
                if (request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
                return UserController.getOrCreate(request)
            }
        }
        else if(arg[1] === 'invites') {
            if (!arg[2]) {
                if (request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
                return InviteController.create(request)
            }
            if (arg[3] === 'accept') return InviteController.accept(arg[2])
            if (arg[3] === 'join') return authenticate(request, arg[2], InviteController.join)
        }
        else if (arg[1] === 'groups') {
            if (!arg[2]) {
                if (request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
                return GroupController.create(request)
            }
            if (arg[3] === 'users') {
                if (request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
                return GroupUserController.addToGroup(request, Number(arg[2]))
            }
        }
        else if (arg[1] === 'cameras') {
            if (arg[3] === 'ptz') return authenticate(request, [ url, arg[2] ], CameraController.ptz)
            else if (!arg[2]) {
                if (request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
                return CameraController.create(request)
            }
        }
    }
    else if (method === 'DELETE') {
        if (arg[1] === 'groups') {
            if (arg[3] === 'member' && arg[4] === 'avatar' && Number(arg[2])) {
                return authenticate(request, [ url, Number(arg[2]) ], GroupUserController.deleteAvatar)
            }
        }
        else if (arg[1] === 'cameras') {
            if (Number(arg[2]) && !arg[3]) {
                if (request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
                return CameraController.delete(request, arg[2])
            }
        }
        else if (arg[1] === 'sessions') {
            if (Number(arg[2]) && !arg[3]) return authenticate(request, Number(arg[2]), AuthController.logout)
        }
    }
    else if (method === 'PATCH') {
        if (arg[1] === 'groups') {
            if (arg[3] === 'member') {
                if (arg[4] === 'avatar') return authenticate(request, [ url, arg[2] ], GroupUserController.updateAvatar)
                else return authenticate(request, [ url, arg[2] ], GroupUserController.update)
            }
        }
        else if (arg[1] === 'cameras') {
            if (Number(arg[2]) && !arg[3]) {
                if (request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
                return CameraController.update(request, [ url, Number(arg[2]) ])
            }
        }
        else if (arg[1] === 'admin') {
            if (request.access !== 'ALL') return sendJson({ error: 'No Access' }, 403)
            return DBUtils.patch(request)
        }
    }
    
    // TODO ratelimit if 404
    return new Response('Not Found', { status: 404 });
}

const sendJson = (json, status) => {
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
}

const apiServer = serve({
    port: API_PORT,
    async fetch(request, server) {
        const url = new URL(request.url)
        if (url.pathname === '/ws' || url.pathname === '/cctv-ws' || url.pathname === '/cctv-api/ws' || url.pathname.endsWith('/ws')) {
            const auth = await authenticateWs(request)
            if (!auth) return new Response('Unauthorized', { status: 401 })
            const success = server.upgrade(request, {
                data: {
                    userId: auth.userId,
                    sessionId: auth.sessionId,
                    tokenExp: auth.tokenExp,
                    groupIds: auth.groupIds || []
                }
            })
            if (success) return undefined
            return new Response('WebSocket upgrade failed', { status: 400 })
        }
        return nginxHandler(request)
    },
    websocket: {
        idleTimeout: 120,
        sendPings: true,
        open(ws) {
            console.log(`[WS] Client connected: user ${ws.data?.userId}, session ${ws.data?.sessionId}`)
            registerWsSocket(ws)
            if (ws.data?.userId) ws.subscribe(`user:${ws.data.userId}`)
            if (ws.data?.groupIds) {
                for (const gid of ws.data.groupIds) {
                    ws.subscribe(`group:${gid}`)
                }
            }
            ws.send(JSON.stringify({ type: 'connected', userId: ws.data?.userId }))
        },
        async message(ws, message) {
            try {
                const data = typeof message === 'string' ? JSON.parse(message) : {}
                if (data.type === 'ping') {
                    // 1. Проверяем не истек ли токен (даем 2 мин запаса на сетевой рассинхрон)
                    const nowSec = Math.floor(Date.now() / 1000)
                    const expSec = ws.data?.tokenExp > 100000000 ? ws.data.tokenExp : (ws.data?.tokenExp ? ws.data.tokenExp * 60 : 0)
                    if (expSec && nowSec > expSec + 120) {
                        console.log(`[WS] Token expired for user ${ws.data?.userId}, closing socket`)
                        ws.close(4002, 'Token expired')
                        return
                    }
                    // 2. Проверяем не сброшена ли сессия в Redis
                    if (ws.data?.sessionId) {
                        const disabled = await redis.exists('disabled-session-' + ws.data.sessionId)
                        if (disabled) {
                            console.log(`[WS] Session ${ws.data.sessionId} was revoked, closing socket`)
                            ws.close(4001, 'Session revoked')
                            return
                        }
                    }
                    ws.send(JSON.stringify({ type: 'pong' }))
                }
                if (data.type === 'refresh_auth' && data.token) {
                    const payload = verifyAccessToken(data.token)
                    if (payload && payload.userId === ws.data?.userId && payload.sessionId === ws.data?.sessionId) {
                        ws.data.tokenExp = Number(payload.exp)
                        ws.send(JSON.stringify({ type: 'auth:refreshed' }))
                    } else {
                        ws.close(4001, 'Invalid token on refresh')
                    }
                }
                if (data.type === 'subscribe_group' && data.groupId) {
                    ws.subscribe(`group:${data.groupId}`)
                }
            } catch (e) {
                console.error('[WS] Message error:', e)
            }
        },
        close(ws, code, reason) {
            unregisterWsSocket(ws)
            console.log(`[WS] Client disconnected: user ${ws.data?.userId}, code: ${code}, reason: ${reason || 'none'}`)
        }
    },
    development: false,
})

setWsServer(apiServer)

serve({
    port: MEDIA_PORT,
    fetch: AuthController.allowMediaAccess,
    development: false,
})

console.log('✔ Все настройки завершены!\n✔ Прослушиваю порт:', API_PORT, "\n✔ Для MediaMTX порт:", MEDIA_PORT)
