import 'dotenv/config'
import { TelegramBot } from './keygram'
import startModule from './modules/start'
import adminModule from './modules/admin'
import middlewares from './modules/middlewares'

const TOKEN = process.env.BOT_TOKEN
const bot = new TelegramBot({ token: TOKEN, signCallbacks: false })

middlewares.init(bot)
startModule.init(bot)
adminModule.init(bot)

bot.startPolling()
console.log('Success!\nBot initialized')
