import { Panel, Callback } from '../keygram'

const ADMIN_ID = +process.env.ADMIN_ID
const isAdmin = ctx => ctx?.user?.id === ADMIN_ID || ctx?.from?.id === ADMIN_ID || ctx?.user?.id === 1

const startPanel = Panel().Text(ctx => `Привет, <b>${ctx.from.first_name}</b>\n`
  + 'Бот создан на <a src="https://npmjs.org/keygram">Keygram</a>')
  .Callback("📌 Мой аккаунт", "profile").Row()
  .Optional(ctx => isAdmin(ctx) && Callback("📎 Панель управления", "adminDashboard"))

const profile = ctx => {
  ctx.reply("В разработке!")
}

const onStart = ctx => {
  console.log('User:', ctx.user?.id, 'From:', ctx.from?.id, 'isAdmin:', isAdmin(ctx), 'ADMIN_ID:', ADMIN_ID)
  if (ctx.state.input) ctx.state = {}
  return ctx.open(startPanel)
}

export default {
  init: bot => {
    bot.on('/start', onStart)
    bot.register(profile)
  }
}
