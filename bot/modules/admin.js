import { Panel, Pagination, Callback, Image } from '../keygram'
import request from '../utils/request'
import { generate } from '../utils/qrController'
import { parseCameraInput } from '../utils/cameraPresets'
import fs from 'fs'

const ADMIN_ID = +process.env.ADMIN_ID

const isAdmin = ctx => ctx?.user?.id === ADMIN_ID || ctx?.from?.id === ADMIN_ID || ctx?.user?.id === 1

const dashboard = Panel().Text("📎 <b>Панель управления</b>")
                         .Callback("🌟 Группы", listGroups).Row()
                         .Callback("🌟 Пользователи", 'listUsers')

const getGroups = async ctx => {
    const response = await request("groups?fields=users,cameras", { method: 'GET' })
    return response?.groups || []
}

const getCameras = async (ctx, page, groupId) => {
    const { success, group } = await request("groups/" + groupId + "?fields=cameras", { method: 'GET' })
    ctx.groupName = group?.name
    return group?.cameras || []
}

const groups = Pagination("groups").Data(getGroups)
    .Keys((ctx, data) => Panel().Add(data.map(gr => [Callback(gr.name, "openGroup", gr.id)])))
    .AfterKeys(ctx => Panel().Callback("➕ Создать группу", createGroup).Row()
                            .Callback("Обратно", "adminDashboard"))
    .Text((ctx, data, page) => `✏ <b>Группы</b> (страница ${page+1}/${ctx.maxPage})`)

const cameras = Pagination("cameras").Data(getCameras)
    .Keys((ctx, data, page, groupId) =>
        Panel().Add(data.map(c => [Callback(c.name, "openCamera", groupId, c.id)])))
    .AfterKeys((ctx, data, page, groupId) =>
                Panel().Callback("➕ Создать камеру", createCamera, groupId).Row()
                        .Callback("Обратно", "openGroup", groupId))
    .Text((ctx, data, page) => `✏ <b>Камеры группы ${ctx.groupName}</b> (страница ${page+1}/${ctx.maxPage})`)

function createGroup(ctx) {
    if (!isAdmin(ctx)) return 'onStart'
    ctx.input(createGroupFin, { allow: 'onStart' })
    return ctx.reply("✏ <b>Хорошо!</b>\nДля создания группы, пожалуйста, введите название.")
}

async function createGroupFin(ctx) {
    if (!ctx.text) return ctx.reply("✏ Пожалуйста, введите название!")
    const response = await request('groups', { method: 'POST', body: { name: ctx.text } })
    console.log('createGroupFin', response)
    ctx.state = {}
    return listGroups(ctx)
}

function createCamera(ctx, groupId) {
    if (!isAdmin(ctx)) return 'onStart'
    ctx.input(createCameraSetName, { allow: 'onStart', groupId })
    console.log(groupId)
    return ctx.reply("✏ <b>Хорошо!</b>\nВведите название камеры")
}

async function createCameraSetName(ctx) {
    if (!ctx.text) return ctx.reply("✏ Пожалуйста, введите название!")
    await ctx.input(createCameraSetConfig, { name: ctx.text })
    const hint = "✏ <b>Введите источник:</b>\n\n"
      + "1. Прямую RTSP ссылку:\n<code>rtsp://admin:pass@192.168.1.50:554/live</code>\n\n"
      + "2. Либо через пробел: <b>IP Логин Пароль [Бренд]</b>\n"
      + "Пример: <code>192.168.1.50 admin pass hikvision</code>\n"
      + "(Бренды: <i>hikvision, dahua, reolink, xmeye, generic</i>)"
    return ctx.reply(hint)
}

async function createCameraSetConfig(ctx) {
    if (!ctx.text) return ctx.reply("✏ Пожалуйста, введите источник!")
    const { groupId, name } = ctx.state
    const config = parseCameraInput(ctx.text)
    const body = { groupId, name, config }
    const response = await request('cameras', { method: 'POST', body })
    console.log('createCameraSetConfig', response)
    if (response?.error) {
        return ctx.reply(`❌ <b>Ошибка:</b> ${response.error}`)
    }
    ctx.state = {}
    return listCameras(ctx, groupId)
}

async function deleteCamera(ctx, groupId, cameraId) {
    if (!isAdmin(ctx)) return 'onStart'
    const response = await request('cameras/' + cameraId, { method: 'DELETE' })
    console.log(response)
    return listCameras(ctx, groupId)
}

async function openCamera(ctx, groupId, cameraId) {
    if (!isAdmin(ctx)) return;
    const response = await request("cameras/" + cameraId, { method: 'GET' })
    if (!response.success) return ctx.reply("Ошибка!")
    console.log(response)
    const camera = response.camera
    const text = `✏ <b>Камера ${camera.name}</b>\n<b>Источник (получатель):</b> ${camera.config}\n\n<b>Медиа-источник (отправитель):</b> ${camera.media}`
    const keyboard = Panel().Text(text).Callback("➖ Удалить камеру", "deleteCamera", groupId, cameraId).Row()
                                       .Callback("Обратно", "openGroup", groupId)
    return ctx.open(keyboard)
}

const cancel = ctx => {
    const state = ctx.state;
    if (!state) return 'onStart'
    ctx.state = {};
    if (state.input === 'createInviteInput') return openGroup(ctx, state.groupId)
    else if (state.input === 'createGroup') return listGroups(ctx)
}

function listGroups(ctx) {
    if (isAdmin(ctx)) return ctx.open(groups)
}

async function openGroup(ctx, groupId) {
    if (!isAdmin(ctx)) return;
    const { success, group } = await request("groups/" + groupId + "?fields=users", { method: 'GET' })
    if (!success) return ctx.reply("Ошибка!")
    const text = `✏ <b>Группа ${group.name}</b>\n<b>Участники:</b> ${group.users.map(x => x.name).join(', ')}`
    + `\nОтсюда вы можете, например, создать приглашение для нового участника.`
    const keyboard = Panel().Text(text).Callback("Список камер", "listCameras", groupId).Row()
                                       .Callback("💡 Создать приглашение", "createInvite", +groupId).Row()
                                       .Callback("Обратно", "listGroups")
    return ctx.open(keyboard)
}

async function listCameras(ctx, groupId) {
    if (isAdmin(ctx)) return cameras.open(ctx, 0, groupId)
}

async function createInvite(ctx, groupId) {
    if (!isAdmin(ctx) || Number.isNaN(Number(groupId))) return;
    
    const body = { groupId, userId: ctx.user.id }
    const invite = await request('invites', { method: 'POST', body })
    
    const { buf } = await generate(
        '0000.' + invite.nonce + '.' + invite.expiresAt, 'favicon.png',
        { scale: 8, margin: 4, ecLevel: 'H', centerRatio: 0.27, framePadding: 12 }
    );
    
    fs.writeFileSync('image.png', buf)
    
    const text = "✏ <b>Приглашение в группу</b>\nБудет действовать ещё 10 минут!"
               + `\nЕсли сканер не работает: <b>${invite.nonce}</b> (код группы)`
    
    return ctx.reply({ text, ...Image('./image.png') })
}

const adminLists = ctx => ctx.open(lists)
const adminActions = ctx => ctx.open(actions)
const adminDashboard = ctx => ctx.open(dashboard)

export default {
  init: bot => {
    bot.register(adminDashboard, openGroup, createGroup, createGroupFin, createInvite, listCameras, createCamera, openCamera,
    createCameraSetName, createCameraSetConfig, deleteCamera)
  }
}
