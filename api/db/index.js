import { Sequelize } from '@sequelize/core'
import { PostgresDialect } from '@sequelize/postgres'

import User from './models/User'
import GroupUser from './models/GroupUser'
import Group from './models/Group'
import Session from './models/Session'
import Invite from './models/Invite'
import Camera from './models/Camera'
import Token from './models/Token'

import WebAccount from './models/WebAccount'
import TelegramAccount from './models/TelegramAccount'

const sequelize = new Sequelize({
  dialect: PostgresDialect,
  url: process.env.DATABASE_URL,
  pool: {
    max: 5,
    min: 0,
    idle: 10000,
  },
})

const models = {
  User,
  GroupUser,
  Group,
  Camera,
  Invite,
  Session,
  WebAccount,
  TelegramAccount,
  Token
}

const listed = Object.values(models)

// #1 Столбцы и функции
for (const model of listed) {
  console.log('[DB] Иниц. таблица ' + model.name)
  if (model.init) model.init(sequelize)
}

// #2 Связи таблиц
for (const model of listed) {
  console.log('[DB] Иниц. связи для ' + model.name)
  if (model.associate) model.associate(models)
}

const RESET_DATABASE = false
await sequelize.sync({ force: RESET_DATABASE, alter: true })

export default sequelize
