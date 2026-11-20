import { Panel, ParserError } from '../keygram'
import getUser from '../utils/getUser'
import fs from 'fs'

const setUser = async ctx => {
    ctx.user = await getUser(ctx).catch(console.error)
    if (!ctx.user || ctx.user.error) {
        console.error('[Bot Error] Failed to get user from API:', ctx.user?.error || ctx.user)
        return ctx.reply(`💫 <b>Упс! Ошибка связи с API:</b> ${ctx.user?.error || 'не удалось загрузить пользователя'}\nПроверьте BOT_SECRET в файле .env`)
    }
}

const states = fs.existsSync('states') ? JSON.parse(fs.readFileSync('states', 'utf-8')) : {}

const saveState = (ctx, state) => {
    states[ctx.from.id] = state
}

const loadState = (ctx, state) => {
    return states[ctx.from.id]
}

setInterval(() => {
    fs.writeFileSync('states', JSON.stringify(states, null, 2))
}, 10000)

export default {
  init: bot => {
    bot.limit(0.5, ctx => ctx.isCallback ? ctx.answer("Притормози!") : ctx.reply("Пожалуйста, пишите реже :3"))
    bot.setParser('HTML')
    bot.alwaysUse(setUser)
    bot.states.save = saveState
    bot.states.load = loadState
  }
}
