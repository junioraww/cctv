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

function nginxHandler(request) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    
    // Safely extract client IP from X-Real-IP or the last hop in X-Forwarded-For
    const realIp = request.headers.get("x-real-ip")
    const forwarded = request.headers.get("x-forwarded-for")
    request.ip = realIp || (forwarded ? forwarded.split(',').pop().trim() : "127.0.0.1")
    
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
        if (arg[1] === 'cameras') {
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

serve({
    port: API_PORT,
    fetch: nginxHandler,
    development: false,
})

serve({
    port: MEDIA_PORT,
    fetch: AuthController.allowMediaAccess,
    development: false,
})

console.log('✔ Все настройки завершены!\n✔ Прослушиваю порт:', API_PORT, "\n✔ Для MediaMTX порт:", MEDIA_PORT)
