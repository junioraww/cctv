import { Sequelize, Op } from '@sequelize/core'
import User from '../db/models/User'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import Camera from '../db/models/Camera'
import GroupUser from '../db/models/GroupUser'
import Group from '../db/models/Group'
import { getToken } from '../utils/tokens'
import sequelize from '../db/index'
import redis from '../utils/redis'

function validateAndSanitizeConfig(config) {
    if (!config || typeof config !== 'string') {
        throw new Error('Config must be a non-empty string')
    }
    const trimmed = config.trim()
    // Direct stream URL (RTSP / RTMP / HTTP with query params allowed)
    if (/^(rtsp|rtsps|rtmp|rtmps|http|https):\/\/[^\s"';`|\\]+$/i.test(trimmed)) {
        return { source: trimmed }
    }
    // FFmpeg command - strictly disallow shell chaining & subshells, allow $MTX_PATH
    if (trimmed.startsWith('ffmpeg')) {
        if (/[;&|`<>\\!]/.test(trimmed) || /\$(?!MTX_[A-Z0-9_]+)/.test(trimmed)) {
            throw new Error('Security Error: Shell operators are not allowed in camera config')
        }
        return { runOnInit: trimmed, runOnInitRestart: true }
    }
    throw new Error('Invalid source: must be rtsp://, rtmp://, http:// URL or safe ffmpeg command')
}

const CameraController = new class CameraController {
    async get(request, [ url, cameraId ]) {
        const params = url.searchParams;
        const groupId = Number(params.get('groupId'))
        
        const canAccessAllGroups = request.access === "ALL"
        const canAccessConfigData = request.access === "ALL"
        
        if(!canAccessAllGroups) {
            if(!groupId) return sendJson({ error: 'No Access' }, 403)
            const { userId } = request
            
            const groupUser = await GroupUser.findOne({
                where: { userId, groupId },
                include: 'group'
            })
            
            if(!groupUser) return sendJson({ error: 'No Access' }, 403)
        }
        
        const response = { success: true }
        
        const condition = cameraId ? { id: cameraId } : ( groupId ? { groupId } : {} )
        
        const cameras = await Camera.findAll({
            where: condition,
            raw: true,
        })
        
        if(!canAccessAllGroups && cameras.some(camera => camera.groupId !== groupId)) {
            return sendJson({ error: 'No Access' }, 403)
        }
        
        const cached = await redis.mGet(cameras.map(x => 'source:' + x.id))
        cached.map((cache, i) => {
            cameras[i].ready = cache?.ready || false
        })
        
        const output = cameras.map(x => {
            return {
                id: x.id,
                groupId: x.groupId,
                name: x.name,
                media: x.media,
                config: canAccessConfigData ? x.config : null
            }
        })
        
        if (cameraId) response.camera = output[0]
        else response.cameras = output
        
        return sendJson(response)
    }
    
    async create(request, args) {
        if(request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
        try {
            const { groupId, name, config } = await request.json()
            if (!groupId || !name || !config) return sendJson({ error: 'Missing required fields' }, 400)
            
            const mediaConfig = validateAndSanitizeConfig(config)
            
            // TODO поддержка dash, webrtc
            const media = JSON.stringify([
              {
                "type": "hls",
                "quality": null,
              }
            ])
            
            const camera = await Camera.create({
                name: String(name).trim(),
                media,
                config: config.trim(),
                groupId: Number(groupId)
            })
            
            const mediaName = groupId + '/' + camera.id
            const body = {
                sourceOnDemand: false,
                ...mediaConfig
            }
            
            await fetch(baseUrl + "config/paths/add/" + mediaName, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            
            return sendJson(camera.dataValues)
        } catch (err) {
            return sendJson({ error: err.message }, 400)
        }
    }
    
    async delete(request, id) {
        if(request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
        const camera = await Camera.findOne({ where: { id }, include: 'group' })
        if (!camera) return sendJson({ error: 'Not Found' }, 404)
        
        await camera.destroy()
        await fetch(baseUrl + "config/paths/delete/" + camera.group.id + '/' + camera.id, { method: 'DELETE' })
        return sendJson({ success: true })
    }
    
    async ptz(request, [ url, cameraId ]) {
        const { userId } = request
        const { groupId, action } = await request.json()
        
        if(!cameraId || !userId || !groupId || !action) return sendJson({ error: 'No Access' })
        
        const groupUser = await GroupUser.findOne({
            where: { userId, groupId },
            include: {
                model: Group,
                as: 'group',
                include: {
                    model: Camera,
                    as: 'cameras',
                    where: { id: cameraId },
                    required: true
                }
            }
        });
        
        if(!groupUser) return sendJson({ error: 'No Access' })
        
        const velocity = {
            x: action === 'left' ? -0.1 : action === 'right' ? 0.1 : 0,
            y: action === 'down' ? -0.1 : action === 'up' ? 0.1 : 0,
            zoom: 0
        }
        
        // TODO only for master
        // TODO specify ip in "config"
        try {
            const cam = new Cam({
              hostname: '10.0.0.2',
              username: 'admin',
              password: '',
              port: 8822
            })
            console.log('[debug] Cam init')
            await cam.connect();
            console.log('[debug] Cam conn')
            await cam.continuousMove(velocity)
            console.log('[debug] Cam moved')
        } catch (e) { console.error(e) }
        
        return sendJson({ success: true })
    }
}

const { Cam } = require('onvif/promises');



// MediaMTX Integration
const baseUrl = "http://mediamtx:9997/v3/"

const initMedia = async() => {
    try {
        const response = await fetch(baseUrl + "config/paths/list")
        if (!response.ok) return
        const paths = await response.json()
        const existingPathNames = new Set((paths?.items || []).map(x => x.name))
        
        const dbCameras = await Camera.findAll({ include: 'group' })
        const dbCameraMap = new Map()
        
        for (const cam of dbCameras) {
            const pathName = cam.group.id + '/' + cam.id
            dbCameraMap.set(pathName, cam)
            await addOrUpdateCamera({ name: pathName, config: cam.config })
        }
        
        // Remove orphan paths in MediaMTX that are not in DB
        for (const item of (paths?.items || [])) {
            if (item.name !== "all_others" && !dbCameraMap.has(item.name)) {
                await removeCamera({ name: item.name })
            }
        }
    } catch (e) {
        console.error('initMedia error:', e)
    }
}

const addOrUpdateCamera = async camera => {
    try {
        const mediaConfig = validateAndSanitizeConfig(camera.config)
        const body = {
            sourceOnDemand: false,
            ...mediaConfig
        }
        // Try to patch existing path in MediaMTX
        const patchRes = await fetch(baseUrl + "config/paths/patch/" + camera.name, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        if (!patchRes.ok) {
            // If it doesn't exist yet, add it
            await fetch(baseUrl + "config/paths/add/" + camera.name, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
        }
        console.log('Configured source', camera.name)
    } catch(e) {
        console.error('Failed to configure camera:', camera.name, e.message)
    }
}

const removeCamera = async camera => {
    try {
        await fetch(baseUrl + "config/paths/delete/" + camera.name, { method: 'DELETE' })
        console.log('Deleted source', camera.name)
    } catch(e) {
        console.error('Failed to remove camera:', camera.name, e.message)
    }
}

let latestSources = []

const fetchMedia = async() => {
    try {
        const response = await fetch(baseUrl + "paths/list")
        if (!response.ok) return
        const { items } = await response.json()
        
        const sources = (items || []).map(path => {
            return {
                name: path.name || path.confName,
                ready: path.ready,
            }
        })
        
        for (const source of sources) {
            const data = JSON.stringify({ ready: source.ready })
            await redis.set('source:' + source.name, data)
        }
        latestSources = sources
    } catch (e) {
        for(const source of latestSources) {
            const data = JSON.stringify({ ready: false })
            await redis.set('source:' + source.name, data)
        }
        latestSources = []
        console.error(e)
    }
}

if(process.env.MASTER === "true") {
    console.log('Режим Master: запуск синхронизации источников...')
    setTimeout(async () => {
        console.log("Режим Master: настраиваем источники")
        await initMedia()
        await fetchMedia()
        setInterval(initMedia, 15000)
        setInterval(fetchMedia, 2000)
        console.log("Режим Master: источники успешно настроены")
    }, 1000);
}



const sendJson = (json, headers) => {
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json', ...headers } })
}

export default CameraController
