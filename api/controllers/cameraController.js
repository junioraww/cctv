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

const CameraController = new class CameraController {
    async get(request, [ url, cameraId ]) {
        const params = url.searchParams;
        const groupId = Number(params.get('groupId'))
        
        const canAccessAllGroups = request.access === "ALL"
        const canAccessConfigData = request.access === "ALL"
        
        if(!canAccessAllGroups) {
            if(!groupId) return sendJson({ error: 'No Access' })
            const { userId } = request
            
            const groupUser = await GroupUser.findOne({
                where: { userId, groupId },
                include: 'group'
            })
            
            if(!groupUser) return sendJson({ error: 'No Access' })
        }
        
        const response = { success: true }
        
        const condition = cameraId ? { id: cameraId } : ( groupId ? { groupId } : {} )
        
        const cameras = await Camera.findAll({
            where: condition,
            raw: true,
        })
        
        if(!canAccessAllGroups && cameras.find(camera => camera.groupId)) return sendJson({ error: 'No Access' })
        
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
        if(request.access !== "ALL") return new Response()
        const { groupId, name, config } = await request.json()
        
        // TODO поддержка dash, webrtc
        const media = JSON.stringify([
          {
            "type": "hls",
            "quality": null,
          }
        ])
        
        const camera = await Camera.create({
            name,
            media,
            config,
            groupId
        })
        
        const mediaName = groupId + '/' + camera.id
        const body = {}
        if(config.slice(0, 2) === 'ff') {
            body.runOnInit = config
            body.runOnInitRestart = true
        } else {
            body.source = config
        }
        
        await fetch(baseUrl + "config/paths/add/" + mediaName, { method: 'POST', body: JSON.stringify(body) })
        
        return sendJson(camera.dataValues)
    }
    
    async delete(request, id) {
        if(request.access !== "ALL") return new Response()
        const camera = await Camera.findOne({ where: { id }, include: 'group' })
        
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
const baseUrl = "http://localhost:9997/v3/"

// Not a single line from ChatGPT, yall hear me?
const initMedia = async() => {
    try {
        const media = await getConfigs()
        
        const cameras = []
        for(const x of await Camera.findAll({ include: 'group' })) {
            const name = x.group.id + '/' + x.id
            cameras.push({ name, config: x.config })
        }
        
        const mustAdd = cameras.filter(x => !media.find(y => y.name === x.name))
        const mustRemove = media.filter(x => !cameras.find(y => x.name === y.name))
        const mustEdit = media.filter(x => cameras.find(y => y.name === x.name && x.config !== y.config))
        
        for(const cam of mustAdd) await addCamera(cam);
        for(const cam of mustRemove) await removeCamera(cam);
        for(const cam of mustEdit) await updateCamera(cam);
        
    } catch (e) { console.error(e) }
}

const getConfigs = async () => {
    const response = await fetch(baseUrl + "config/paths/list")
    const paths = await response.json()
    const media = paths.items.filter(x => x.name !== "all_others").map(x => {
        return { name: x.name,
                 config: x.runOnInit.length ? x.runOnInit : x.source }
    })
    return media
}

const addCamera = async camera => {
    const body = {}
    if(camera.config.slice(0,2) === 'ff') { // FFMpeg restream
        body.runOnInit = camera.config
        body.runOnInitRestart = true
    } else {
        body.source = camera.config // URL
    }
    await fetch(baseUrl + "config/paths/add/" + camera.name, { method: 'POST', body: JSON.stringify(body) })
    console.log('Created source', camera.name)
}

const removeCamera = async camera => {
    const resp = await fetch(baseUrl + "config/paths/delete/" + camera.name, { method: 'DELETE' })
    console.log('Deleted source', camera.name)
}

const updateCamera = async camera => {
    const body = {}
    if(camera.config[0] === 'run') {
        body.runOnInit = camera.config
        body.runOnInitRestart = true
    } else {
        body.source = camera.config
    }
    await fetch(baseUrl + "config/paths/patch/" + camera.name, { method: 'PATCH', body: JSON.stringify(body) })
    console.log('Updated source', camera.name)
}

const restartCamera = async camera => {
    await removeCamera(camera)
    await addCamera(camera)
}

let latestSources = []

// UPDATED:
// Повторная инициализация источника при ready = false

const fetchMedia = async() => {
    try {
        const response = await fetch(baseUrl + "paths/list")
        const { items } = await response.json()
        
        const sources = items.map(path => {
            return {
                name: path.confName,
                ready: path.ready,
                //readers: path.readers hlsMuxer entry is unusable
            }
        })
        
        const changedSources = latestSources.length === 0 ? sources : sources.filter((x, i) => x.ready !== latestSources[i]?.ready)
        
        let media;
        
        if(changedSources) {
            media = await getConfigs();
            
            latestSources = sources;
            for(const source of changedSources) {
                const data = JSON.stringify({ ready: source.ready })
                console.log('Кеш для', source.name, 'установлен на', data)
                await redis.set('source:' + source.name, data)
            }
        }
        
        if (new Date().getSeconds() % 15 === 0) {
            const needRestart = sources.filter(x => !x.ready);
            
            if (needRestart.length) {
                console.log('Request restart for ' + needRestart.map(x => x.name).join(', '))
                if (!media) media = await getConfigs();
                
                for (const source of needRestart) {
                    const config = media.find(x => x.name === source.name)
                    if(config) setTimeout(() => restartCamera(config), 1500)
                    else console.error("Ошибка перезапуска источника: конфиг для", source.name, "не найден")
                }
            }
        }
        
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
    console.log("Режим Master: настраиваем источники")
    setInterval(initMedia, 10000)
    await initMedia()

    setInterval(fetchMedia, 1000)
    await fetchMedia()
    console.log("Режим Master: источники успешно настроены")
}



const sendJson = (json, headers) => {
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json', ...headers } })
}

export default CameraController
