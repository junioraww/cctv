import { Sequelize, Op } from '@sequelize/core'
import fs from 'node:fs'
import path from 'node:path'
import User from '../db/models/User'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import Camera from '../db/models/Camera'
import GroupUser from '../db/models/GroupUser'
import Group from '../db/models/Group'
import sequelize from '../db/index'
import redis from '../utils/redis'
import { broadcastToGroup } from '../utils/ws'

const TIMELAPSE_BASE_DIR = fs.existsSync('/timelapse') ? '/timelapse' : path.resolve(process.cwd(), '../timelapse')

function validateAndSanitizeConfig(config, alwaysReady = false, timelapse = false) {
    if (!config || typeof config !== 'string') {
        throw new Error('Config must be a non-empty string')
    }
    const trimmed = config.trim()
    const timelapseCmd = '/bin/sh /timelapse/timelapse.sh'

    // Direct stream URL (RTSP / RTMP / HTTP with query params allowed)
    if (/^(rtsp|rtsps|rtmp|rtmps|http|https):\/\/[^\s"';`|\\]+$/i.test(trimmed)) {
        return {
            source: trimmed,
            sourceOnDemand: !alwaysReady,
            ...(alwaysReady ? {} : {
                sourceOnDemandStartTimeout: "10s",
                sourceOnDemandCloseAfter: "10s"
            }),
            runOnInit: timelapse ? timelapseCmd : '',
            runOnInitRestart: Boolean(timelapse)
        }
    }
    // FFmpeg command - strictly disallow shell chaining & subshells, allow $MTX_PATH
    if (trimmed.startsWith('ffmpeg')) {
        if (/[;&|`<>\\!]/.test(trimmed) || /\$(?!MTX_[A-Z0-9_]+)/.test(trimmed)) {
            throw new Error('Security Error: Shell operators are not allowed in camera config')
        }
        if (alwaysReady) {
            return {
                runOnInit: timelapse ? `${timelapseCmd} & ${trimmed}` : trimmed,
                runOnInitRestart: true,
                runOnDemand: ""
            }
        } else {
            return {
                runOnDemand: trimmed,
                runOnDemandStartTimeout: "10s",
                runOnDemandCloseAfter: "10s",
                runOnInit: timelapse ? timelapseCmd : '',
                runOnInitRestart: Boolean(timelapse)
            }
        }
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
            if(groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
                return sendJson({ error: 'Срок действия доступа истек' }, 403)
            }
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
                alwaysReady: Boolean(x.alwaysReady),
                timelapse: Boolean(x.timelapse),
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
            const { groupId, name, config, alwaysReady, timelapse } = await request.json()
            if (!groupId || !name || !config) return sendJson({ error: 'Missing required fields' }, 400)
            
            const isAlwaysReady = Boolean(alwaysReady)
            const isTimelapse = Boolean(timelapse)
            const mediaConfig = validateAndSanitizeConfig(config, isAlwaysReady, isTimelapse)
            
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
                alwaysReady: isAlwaysReady,
                timelapse: isTimelapse,
                groupId: Number(groupId)
            })
            
            const mediaName = groupId + '/' + camera.id
            await addOrUpdateCamera({
                name: mediaName,
                config: camera.config,
                alwaysReady: camera.alwaysReady,
                timelapse: camera.timelapse
            })
            
            return sendJson(camera.dataValues)
        } catch (err) {
            return sendJson({ error: err.message }, 400)
        }
    }

    async update(request, [ url, cameraId ]) {
        if(request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
        try {
            const camera = await Camera.findOne({ where: { id: cameraId }, include: 'group' })
            if (!camera) return sendJson({ error: 'Not Found' }, 404)

            const body = await request.json()
            if (body.alwaysReady !== undefined) {
                camera.alwaysReady = Boolean(body.alwaysReady)
            }
            if (body.timelapse !== undefined) {
                camera.timelapse = Boolean(body.timelapse)
            }
            if (body.name !== undefined) {
                camera.name = String(body.name).trim()
            }
            if (body.config !== undefined) {
                camera.config = String(body.config).trim()
            }
            await camera.save()

            if (camera.group) {
                const pathName = camera.group.id + '/' + camera.id
                await addOrUpdateCamera({
                    name: pathName,
                    config: camera.config,
                    alwaysReady: camera.alwaysReady,
                    timelapse: camera.timelapse
                })
            }

            return sendJson({ success: true, camera: camera.dataValues })
        } catch (err) {
            return sendJson({ error: err.message }, 400)
        }
    }

    async getTimelapse(request, [ url, cameraId, subAction ]) {
        const canAccessAllGroups = request.access === "ALL"
        const camera = await Camera.findOne({ where: { id: cameraId }, include: 'group' })
        if (!camera) return sendJson({ error: 'Not Found' }, 404)

        if (!canAccessAllGroups) {
            const { userId } = request
            const groupUser = await GroupUser.findOne({
                where: { userId, groupId: camera.groupId }
            })
            if (!groupUser) return sendJson({ error: 'No Access' }, 403)
            if (groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
                return sendJson({ error: 'Срок действия доступа истек' }, 403)
            }
        }

        const pathName = `${camera.group?.id || camera.groupId}/${camera.id}`
        const dir = path.join(TIMELAPSE_BASE_DIR, pathName)

        if (!fs.existsSync(dir)) {
            return sendJson({ success: true, count: 0, latest: null, frames: [] })
        }

        let files = []
        try {
            files = fs.readdirSync(dir)
                .filter(f => f.endsWith('.jpg') && !f.startsWith('.'))
                .sort()
                .reverse()
        } catch (e) {
            return sendJson({ error: 'Failed to read directory' }, 500)
        }

        if (subAction === 'latest-image' && files.length > 0) {
            const filePath = path.join(dir, files[0])
            const fileData = fs.readFileSync(filePath)
            return new Response(fileData, {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Content-Disposition': `inline; filename="${files[0]}"`
                }
            })
        }

        return sendJson({
            success: true,
            count: files.length,
            latest: files[0] || null,
            frames: files.slice(0, 50)
        })
    }
    
    async delete(request, id) {
        if(request.access !== "ALL") return sendJson({ error: 'No Access' }, 403)
        const camera = await Camera.findOne({ where: { id }, include: 'group' })
        if (!camera) return sendJson({ error: 'Not Found' }, 404)
        
        await camera.destroy()
        if (camera.group) {
            await removeCamera({ name: camera.group.id + '/' + camera.id })
        }
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
        
        if(!groupUser) return sendJson({ error: 'No Access' }, 403)
        if(groupUser.expiresAt && new Date(groupUser.expiresAt) <= new Date()) {
            return sendJson({ error: 'Срок действия доступа истек' }, 403)
        }
        
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
        // Ensure MediaMTX has hlsAlwaysRemux enabled globally without restarting
        await fetch(baseUrl + "config/global/patch", {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hlsAlwaysRemux: true })
        }).catch(() => {})

        const response = await fetch(baseUrl + "config/paths/list")
        if (!response.ok) return
        const paths = await response.json()
        const existingPathNames = new Set((paths?.items || []).map(x => x.name))
        
        const dbCameras = await Camera.findAll({ include: 'group' })
        const dbCameraMap = new Map()
        
        for (const cam of dbCameras) {
            const pathName = cam.group.id + '/' + cam.id
            dbCameraMap.set(pathName, cam)
            await addOrUpdateCamera({
                name: pathName,
                config: cam.config,
                alwaysReady: cam.alwaysReady,
                timelapse: cam.timelapse
            })
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
        const mediaConfig = validateAndSanitizeConfig(camera.config, camera.alwaysReady, camera.timelapse)
        const encodedName = encodeURIComponent(camera.name)
        const body = {
            name: camera.name,
            ...mediaConfig
        }
        // 1. Try to patch existing path in MediaMTX
        const patchRes = await fetch(baseUrl + "config/paths/patch/" + encodedName, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        if (patchRes.ok) {
            console.log(`[MediaMTX] Patched source ${camera.name} (alwaysReady: ${Boolean(camera.alwaysReady)})`)
            return
        }
        // 2. If it doesn't exist yet, add it
        const addRes = await fetch(baseUrl + "config/paths/add/" + encodedName, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        if (addRes.ok) {
            console.log(`[MediaMTX] Added source ${camera.name} (alwaysReady: ${Boolean(camera.alwaysReady)})`)
            return
        }
        // 3. Fallback: try replace
        const replaceRes = await fetch(baseUrl + "config/paths/replace/" + encodedName, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        if (replaceRes.ok) {
            console.log(`[MediaMTX] Replaced source ${camera.name} (alwaysReady: ${Boolean(camera.alwaysReady)})`)
            return
        }
        const errText = await patchRes.text().catch(() => '')
        console.error(`[MediaMTX] Failed to configure ${camera.name} (${encodedName}): status=${patchRes.status} ${errText}`)
    } catch(e) {
        console.error('Failed to configure camera:', camera.name, e.message)
    }
}

const removeCamera = async camera => {
    try {
        const encodedName = encodeURIComponent(camera.name)
        await fetch(baseUrl + "config/paths/delete/" + encodedName, { method: 'DELETE' })
        console.log('[MediaMTX] Deleted source', camera.name)
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

            const prev = latestSources.find(s => s.name === source.name)
            if (!prev || prev.ready !== source.ready) {
                const parts = (source.name || '').split('/')
                if (parts.length === 2) {
                    const gId = Number(parts[0])
                    const cId = Number(parts[1])
                    if (gId && cId) {
                        broadcastToGroup(gId, 'camera:status', { cameraId: cId, ready: Boolean(source.ready) })
                    }
                }
            }
        }
        latestSources = sources
    } catch (e) {
        for(const source of latestSources) {
            const data = JSON.stringify({ ready: false })
            await redis.set('source:' + source.name, data)
            const parts = (source.name || '').split('/')
            if (parts.length === 2) {
                broadcastToGroup(Number(parts[0]), 'camera:status', { cameraId: Number(parts[1]), ready: false })
            }
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
