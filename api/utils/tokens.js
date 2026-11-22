import { timingSafeEqual } from 'node:crypto'

// Версия формата токенов
const VERSION = 1
const SIGNATURE_SIZE = 16

// Нормализация секрета: 32 байта через SHA-256
const rawSecret = process.env.SECRET || 'cctv-default-secret-key-change-it'
const SECRET = Buffer.from(Bun.CryptoHasher.hash('sha256', rawSecret))

// ID Схем
export const SCHEMA_ACCESS = 1
export const SCHEMA_REFRESH = 2
export const SCHEMA_MEDIA = 3
export const SCHEMA_INVITE = 4

const schemas = new Map()

export function registerSchema(id, encode, decode) {
    schemas.set(id, { encode, decode })
}

// Вычисление 128-битного MAC (16 байт) через нативный Bun.CryptoHasher
function sign(data) {
    const hasher = new Bun.CryptoHasher('sha256', SECRET)
    hasher.update(data)
    return Buffer.from(hasher.digest()).subarray(0, SIGNATURE_SIZE)
}

/**
 * Создание токена
 * Лейаут: [ VERSION (1B) | SCHEMA (1B) | EXPIRES_SEC (4B BE) | BODY (NB) | SIGNATURE (16B) ]
 */
export function createToken(schema, payload, expiresSec) {
    const s = schemas.get(schema)
    if (!s) throw new Error(`Unknown token schema: ${schema}`)

    const body = s.encode(payload)
    const token = Buffer.allocUnsafe(1 + 1 + 4 + body.length + SIGNATURE_SIZE)

    token[0] = VERSION
    token[1] = schema
    token.writeUInt32BE(expiresSec, 2)
    body.copy(token, 6)

    // Сигнатура считается от всех байт перед ней (единый непрерывный срез)
    const signData = token.subarray(0, token.length - SIGNATURE_SIZE)
    const signature = sign(signData)
    signature.copy(token, token.length - SIGNATURE_SIZE)

    return token.toString('base64url')
}

/**
 * Безопасная проверка токена (без выбрасывания исключений)
 */
export function verifyToken(tokenStr, expectedSchema) {
    if (!tokenStr || typeof tokenStr !== 'string') return null

    let buf
    try {
        buf = Buffer.from(tokenStr, 'base64url')
    } catch {
        return null
    }

    // Минимальный размер: Version (1) + Schema (1) + Expires (4) + Signature (16) = 22 байта
    if (buf.length < 1 + 1 + 4 + SIGNATURE_SIZE) return null
    if (buf[0] !== VERSION) return null

    const schema = buf[1]
    if (expectedSchema !== undefined && schema !== expectedSchema) return null

    const expires = buf.readUInt32BE(2)
    const nowSec = Math.floor(Date.now() / 1000)
    if (expires < nowSec) return null

    const sig = buf.subarray(buf.length - SIGNATURE_SIZE)
    const signData = buf.subarray(0, buf.length - SIGNATURE_SIZE)
    const expectedSig = sign(signData)

    if (!timingSafeEqual(sig, expectedSig)) return null

    const s = schemas.get(schema)
    if (!s) return null

    const body = buf.subarray(6, buf.length - SIGNATURE_SIZE)
    try {
        const decoded = s.decode(body)
        return {
            ...decoded,
            schema,
            exp: expires
        }
    } catch {
        return null
    }
}

/* ========================================================
   Регистрация схем токенов
======================================================== */

// Схема 1: Access Token (API & WebSocket) -> userId (uint32) + sessionId (uint32) = 8 байт
registerSchema(
    SCHEMA_ACCESS,
    ({ userId, sessionId }) => {
        const buf = Buffer.allocUnsafe(8)
        buf.writeUInt32BE(Number(userId), 0)
        buf.writeUInt32BE(Number(sessionId), 4)
        return buf
    },
    (buf) => {
        if (buf.length < 8) throw new Error('Invalid Access Token body')
        return {
            userId: buf.readUInt32BE(0),
            sessionId: buf.readUInt32BE(4)
        }
    }
)

// Схема 2: Refresh Token (HttpOnly кука) -> sessionId (uint32) + nonce (8 байт) = 12 байт
registerSchema(
    SCHEMA_REFRESH,
    ({ sessionId, nonce }) => {
        const buf = Buffer.allocUnsafe(12)
        buf.writeUInt32BE(Number(sessionId), 0)
        if (nonce && Buffer.isBuffer(nonce)) {
            nonce.copy(buf, 4, 0, 8)
        } else {
            // Случайный nonce для защиты от повторов
            crypto.getRandomValues(buf.subarray(4, 12))
        }
        return buf
    },
    (buf) => {
        if (buf.length < 12) throw new Error('Invalid Refresh Token body')
        return {
            sessionId: buf.readUInt32BE(0),
            nonce: buf.subarray(4, 12).toString('hex')
        }
    }
)

// Схема 3: Media Token (HLS / MediaMTX) -> groupId (uint32) + userId (uint32) = 8 байт
registerSchema(
    SCHEMA_MEDIA,
    ({ groupId, userId }) => {
        const buf = Buffer.allocUnsafe(8)
        buf.writeUInt32BE(Number(groupId), 0)
        buf.writeUInt32BE(Number(userId || 0), 4)
        return buf
    },
    (buf) => {
        if (buf.length < 8) throw new Error('Invalid Media Token body')
        return {
            groupId: buf.readUInt32BE(0),
            userId: buf.readUInt32BE(4)
        }
    }
)

// Схема 4: Invite Token (кука приглашения) -> inviteId (uint32) + groupId (uint32) = 8 байт
registerSchema(
    SCHEMA_INVITE,
    ({ inviteId, groupId }) => {
        const buf = Buffer.allocUnsafe(8)
        buf.writeUInt32BE(Number(inviteId), 0)
        buf.writeUInt32BE(Number(groupId || 0), 4)
        return buf
    },
    (buf) => {
        if (buf.length < 8) throw new Error('Invalid Invite Token body')
        return {
            inviteId: buf.readUInt32BE(0),
            groupId: buf.readUInt32BE(4)
        }
    }
)

/* ========================================================
   Удобные функции-хелперы для проекта
======================================================== */

export const getNowSec = () => Math.floor(Date.now() / 1000)

/**
 * Access Token: живет 10 минут (600 сек)
 */
export function createAccessToken(userId, sessionId, expiresInSec = 600) {
    const expiresSec = getNowSec() + expiresInSec
    return createToken(SCHEMA_ACCESS, { userId, sessionId }, expiresSec)
}

export function verifyAccessToken(tokenStr) {
    return verifyToken(tokenStr, SCHEMA_ACCESS)
}

/**
 * Refresh Token: живет 14 дней
 */
export function createRefreshToken(sessionId, expiresInSec = 14 * 86400) {
    const expiresSec = getNowSec() + expiresInSec
    return createToken(SCHEMA_REFRESH, { sessionId }, expiresSec)
}

export function verifyRefreshToken(tokenStr) {
    return verifyToken(tokenStr, SCHEMA_REFRESH)
}

/**
 * Media Token: живет до 1 часа, либо до точного окончания доступа пользователя
 */
export function createMediaToken(groupId, userId, maxExpiresSec) {
    const defaultExp = getNowSec() + 3600 // 1 час по умолчанию
    const expiresSec = maxExpiresSec ? Math.min(defaultExp, maxExpiresSec) : defaultExp
    return createToken(SCHEMA_MEDIA, { groupId, userId }, expiresSec)
}

export function verifyMediaToken(tokenStr) {
    return verifyToken(tokenStr, SCHEMA_MEDIA)
}

/**
 * Invite Token: живет 5 минут (300 сек)
 */
export function createInviteToken(inviteId, groupId, expiresInSec = 300) {
    const expiresSec = getNowSec() + expiresInSec
    return createToken(SCHEMA_INVITE, { inviteId, groupId }, expiresSec)
}

export function verifyInviteToken(tokenStr) {
    return verifyToken(tokenStr, SCHEMA_INVITE)
}

// Алиас для обратной совместимости
export const getToken = (schema, payload, exp) => createToken(schema, payload, exp)
