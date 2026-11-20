import { LRUCache as LRU } from 'lru-cache'
import { timingSafeEqual } from 'crypto'
import Session from '../db/models/Session'

// TODO change signature storage (add initial secret password)
const SECRET = process.env.SECRET || (() => { throw 'Secret is undefined' })()

export const getNow = () => Math.floor(new Date().getTime() / 60000)

const sigCache = new LRU({
    ttl: 1000 * 60 * 10,
    max: 100,
})

/*
  Токены 
 */

const getMediaToken = (groupId, unixMinute) => {
    if(unixMinute === undefined) unixMinute = getNow()
    const payload = `${groupId}:${unixMinute}`
    // CryptoHasher with secret = HMAC (in Bun)
    const hash = new Bun.CryptoHasher("sha256", SECRET).update(payload).digest("base64")
    return `${groupId}-${unixMinute}-${hash.slice(0, 32)}`
}

const verifyMediaToken = (providedToken, providedGroupId, providedUnixMinute) => {
    const token = getMediaToken(providedGroupId, providedUnixMinute)
    return safeEqual(token, providedToken)
    // UPD: unixMinute сверка вынесена в controller
}

const safeEqual = (a, b) => {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/*
// Verify custom token
*/
function verify(token) {
    if (!token || typeof token !== 'string') return false
    const parts = token.split(".")
    if (parts.length !== 3) return false
    
    return _verify(parts[0], parts[1], parts[2])
}

function _verify(payload, expiresAt, signature) {
    if(Date.now() / 60000 > Number(expiresAt)) return null
    
    const fullPayload = `${payload}.${expiresAt}`
    console.log(fullPayload)
    
    const cachedSig = sigCache.get(fullPayload)
    
    if(cachedSig) return safeEqual(cachedSig, signature)
    
    const notCachedSig = sign(fullPayload)
    const match = safeEqual(notCachedSig, signature)
    if(match) {
        if(sigCache.size > 10000) sigCache.clear()
        sigCache.set(fullPayload, notCachedSig)
        return true
    }
    else return false
}

function verifyAndExtract(token) {
    if (!token || typeof token !== 'string') return false
    const parts = token.split('.')
    if (parts.length !== 3) return false
    if(!_verify(parts[0], parts[1], parts[2])) return false
    return _extract(parts[0], parts[1])
}

function _extract(rawPayload, expiresAt) {
    const parsedPayload = {};
    
    rawPayload.split(",").map(entry => {
        const [ key, value ] = entry.split(':');
        if (key) parsedPayload[key] = value;
    });
    
    return {
        ...parsedPayload,
        exp: expiresAt 
    };
}

function extract(token) {
    if (!token || typeof token !== 'string') return {}
    const parts = token.split(".")
    if (parts.length < 2) return {}
    
    return _extract(parts[0], parts[1])
}

/*
// Custom token implementation
// sha3-512 (stronger) and no JSON (faster)
*/
function getToken(payload, expiresInMinutes = 5) {
    const expiresAt = getNow() + expiresInMinutes
    
    return getTokenUntil(payload, expiresAt)
}

function getTokenUntil(payload, expiresAt) {
    const fullPayload = `${payload}.${expiresAt}`
    const cachedSig = sigCache.get(fullPayload)
    if(cachedSig) return `${fullPayload}.${cachedSig}`
    
    const signature = sign(fullPayload)
    sigCache.set(fullPayload, signature)
    
    return `${fullPayload}.${signature}`
}

function sign(fullPayload) {
    // CryptoHasher with secret = HMAC (in Bun)
    const hasher = new Bun.CryptoHasher("sha512", SECRET)
    hasher.update(fullPayload)
    return hasher.digest("base64")
}

export { getToken, getTokenUntil, extract, verify, verifyAndExtract, verifyMediaToken, getMediaToken }
