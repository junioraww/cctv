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
    if (!response?.success || !response.camera) return ctx.reply("❌ Ошибка при получении данных камеры!")
    const camera = response.camera
    const isAlwaysReady = Boolean(camera.alwaysReady)

    const statusBadge = isAlwaysReady ? '🟢 ВКЛ (Постоянный поток)' : '⚪ ВЫКЛ (По запросу)'
    const toggleBtnText = isAlwaysReady ? '🔴 Выключить постоянный поток' : '🟢 Включить постоянный поток'

    const text = `📹 <b>Камера: ${camera.name}</b>\n\n`
      + `<b>Источник:</b> <code>${camera.config}</code>\n\n`
      + `⚡ <b>Режим готовности:</b> ${statusBadge}\n`
      + (isAlwaysReady
          ? '<i>Камера подключена к серверу 24/7. Поток отдается моментально без задержек на прогрев.</i>'
          : '<i>Камера подключается только при входе зрителей на сайт. Экономит трафик и ресурсы.</i>')

    const keyboard = Panel().Text(text)
        .Callback(toggleBtnText, "toggleAlwaysReady", +groupId, +cameraId, isAlwaysReady ? 0 : 1).Row()
        .Callback("➖ Удалить камеру", "deleteCamera", +groupId, +cameraId).Row()
        .Callback("Обратно", "listCameras", +groupId)
    return ctx.open(keyboard)
}

async function toggleAlwaysReady(ctx, groupId, cameraId, targetState) {
    if (!isAdmin(ctx)) return;
    const isReady = Number(targetState) === 1
    await request("cameras/" + cameraId, {
        method: 'PATCH',
        body: { alwaysReady: isReady }
    })
    return openCamera(ctx, groupId, cameraId)
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
                                       .Callback("💡 Создать приглашение", "chooseInviteType", +groupId).Row()
                                       .Callback("Обратно", "listGroups")
    return ctx.open(keyboard)
}

async function listCameras(ctx, groupId) {
    if (isAdmin(ctx)) return cameras.open(ctx, 0, groupId)
}

async function chooseInviteType(ctx, groupId) {
    if (!isAdmin(ctx) || Number.isNaN(Number(groupId))) return;
    const text = "💡 <b>Создание приглашения</b>\nВыберите тип доступа для нового участника:"
    const keyboard = Panel().Text(text)
        .Callback("♾ Постоянный доступ", "createInvitePermanent", +groupId).Row()
        .Callback("⏳ Временный доступ", "chooseTempDuration", +groupId).Row()
        .Callback("Обратно", "openGroup", +groupId)
    return ctx.open(keyboard)
}

async function chooseTempDuration(ctx, groupId) {
    if (!isAdmin(ctx) || Number.isNaN(Number(groupId))) return;
    const text = "⏳ <b>Временный доступ</b>\nВыберите срок действия доступа после активации:"
    const keyboard = Panel().Text(text)
        .Callback("1 час", "createInviteTemp", +groupId, 60)
        .Callback("3 часа", "createInviteTemp", +groupId, 180).Row()
        .Callback("12 часов", "createInviteTemp", +groupId, 720)
        .Callback("24 часа (1 день)", "createInviteTemp", +groupId, 1440).Row()
        .Callback("3 дня", "createInviteTemp", +groupId, 4320)
        .Callback("7 дней", "createInviteTemp", +groupId, 10080).Row()
        .Callback("Обратно", "chooseInviteType", +groupId)
    return ctx.open(keyboard)
}

async function createInvitePermanent(ctx, groupId) {
    return generateAndSendInvite(ctx, groupId, false, null, "Бессрочно")
}

async function createInviteTemp(ctx, groupId, durationMinutes) {
    const labels = {
        60: "1 час",
        180: "3 часа",
        720: "12 часов",
        1440: "24 часа (1 день)",
        4320: "3 дня",
        10080: "7 дней"
    }
    const label = labels[durationMinutes] || `${durationMinutes} мин.`
    return generateAndSendInvite(ctx, groupId, true, durationMinutes, label)
}

async function generateAndSendInvite(ctx, groupId, isTemporary, durationMinutes, durationLabel) {
    if (!isAdmin(ctx) || Number.isNaN(Number(groupId))) return;
    
    let groupName = ''
    try {
        const groupRes = await request(`groups/${groupId}`)
        groupName = groupRes?.name || groupRes?.group?.name || ''
    } catch (e) {}

    const body = { 
        groupId, 
        userId: ctx.user.id,
        isTemporary: Boolean(isTemporary),
        durationMinutes: isTemporary ? Number(durationMinutes) : null
    }
    const invite = await request('invites', { method: 'POST', body })
    
    if (!invite || !invite.nonce) {
        return ctx.reply("❌ Не удалось создать приглашение")
    }

    const host = (process.env.INVITE_DOMAIN || process.env.APP_URL || 'voice-chat.lisyak.net')
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')
    const inviteLink = `https://${host}/invite/${invite.nonce}`

    const { buf } = await generate(
        inviteLink, 'favicon.png',
        { scale: 8, margin: 4, ecLevel: 'H', centerRatio: 0.27, framePadding: 12 }
    );
    
    fs.writeFileSync('image.png', buf)
    
    const groupTitle = groupName ? ` в группу «${groupName}»` : ''
    const text = `✏ <b>Приглашение${groupTitle}</b>\n`
               + (isTemporary ? `⏳ <b>Тип доступа:</b> Временный (${durationLabel})\n` : `♾ <b>Тип доступа:</b> Постоянный\n`)
               + "⏰ <b>Срок действия кода:</b> 1 час\n\n"
               + `🔗 <b>Ссылка для входа:</b>\n${inviteLink}\n\n`
               + `🔑 <b>Код активации:</b> <code>${invite.nonce}</code>\n`
               + "<i>(нажмите на код, чтобы скопировать)</i>"
    
    return ctx.reply({ text, ...Image('./image.png') })
}

const adminLists = ctx => ctx.open(lists)
const adminActions = ctx => ctx.open(actions)
const adminDashboard = ctx => ctx.open(dashboard)

export default {
  init: bot => {
    bot.register(adminDashboard, openGroup, createGroup, createGroupFin, chooseInviteType, chooseTempDuration,
    createInvitePermanent, createInviteTemp, listCameras, createCamera, openCamera, toggleAlwaysReady,
    createCameraSetName, createCameraSetConfig, deleteCamera)
  }
}
