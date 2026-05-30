import { Panel, Callback } from '../keygram'

const ADMIN_ID = +process.env.ADMIN_ID

const startPanel = Panel().Text(ctx => `Привет, <b>${ctx.from.first_name}</b>\n`
  + 'Бот создан на <a src="https://npmjs.org/keygram">Keygram</a>')
  .Callback("📌 Мой аккаунт", "profile").Row()
  .Optional(ctx => ctx.user.id === ADMIN_ID && Callback("📎 Панель управления", "adminDashboard"))

const profile = ctx => {
  ctx.reply("В разработке!")
}

const onStart = ctx => {
  console.log('Sent start message for', ctx.user.id, 'admin_id =', ADMIN_ID)
  if (ctx.state.input) ctx.state = {}
  return ctx.open(startPanel)
}

export default {
  init: bot => {
    bot.on('/start', onStart)
    bot.register(profile)
  }
}
