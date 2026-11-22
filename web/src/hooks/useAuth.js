import { useState, useEffect, useRef, useCallback } from 'react'
import API_URL from '../utils/API_URL'

function extractTokenExpiryMs(tokenStr, fallbackExp) {
    if (fallbackExp) {
        return fallbackExp > 100000000 ? fallbackExp * 1000 : fallbackExp * 60000
    }
    if (!tokenStr || typeof tokenStr !== 'string') return 0
    try {
        if (tokenStr.includes('.')) {
            const parts = tokenStr.split('.')
            const min = Number(parts[1])
            if (min) return min * 60000
        }
        // Base64url SBT token (bytes 2..5 contain uint32BE unix seconds)
        const b64 = tokenStr.replace(/-/g, '+').replace(/_/g, '/')
        const bin = atob(b64)
        if (bin.length >= 6) {
            const expSec = ((bin.charCodeAt(2) << 24) | (bin.charCodeAt(3) << 16) | (bin.charCodeAt(4) << 8) | bin.charCodeAt(5)) >>> 0
            return expSec * 1000
        }
    } catch (e) {}
    return 0
}

export default function useAuth() {
    const [ logged, setLogged ] = useState(undefined)
    const session = useRef(JSON.parse(localStorage.getItem('session') || '{}'))
    const [ token, setToken ] = useState(undefined)
    const tokenRef = useRef(null)
    const refreshPromiseRef = useRef(null)
    
    const updateToken = useCallback((data) => {
        if (data && data.token) {
            const _token = data.token
            const _session = data.session // id
            setToken(_token)
            tokenRef.current = _token
            const expiresAtMs = extractTokenExpiryMs(_token, data.expiresAt)
            session.current = { id: _session, expiresAtMs, userId: NaN }
            localStorage.setItem('session', JSON.stringify(session.current))
            setLogged(true)
        } else {
            setToken(null)
            tokenRef.current = null
            localStorage.setItem('session', null)
            setLogged(false)
        }
    }, [])

    const getSession = useCallback(() => {
        return JSON.parse(JSON.stringify(session))
    }, [])

    const refresh = useCallback(async () => {
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current
        }

        const runRefresh = async () => {
            try {
                const res = await fetch(API_URL + 'auth/refresh', {
                    method: 'POST',
                    credentials: 'include',
                })
                if (!res.ok && res.status !== 200) {
                    return false
                }
                const data = await res.json()
                if (data && data.token) {
                    updateToken(data)
                    return true
                }
                return false
            } catch(e) {
                console.error('[Auth] Refresh error:', e)
                return false
            } finally {
                refreshPromiseRef.current = null
            }
        }

        refreshPromiseRef.current = runRefresh()
        return refreshPromiseRef.current
    }, [ updateToken ])

    // Proactive background refresh timer: keeps access token renewed 2 minutes before expiry
    useEffect(() => {
        if (!logged || !session.current?.expiresAtMs) return

        const expiresAtMs = Number(session.current.expiresAtMs)
        if (!expiresAtMs) return

        const msUntilExpiry = expiresAtMs - Date.now()
        const msUntilRefresh = msUntilExpiry - 120000 // 2 minutes before expiry
        const delay = Math.max(100, msUntilRefresh)

        const timer = setTimeout(async () => {
            const ok = await refresh()
            if (!ok && msUntilExpiry <= 0) {
                logout()
            }
        }, delay)

        return () => clearTimeout(timer)
    }, [ token, logged, refresh ])
    
    const api = useCallback(async (path, authorized, opts = {}) => {
        if (authorized) {
            const expMs = session.current?.expiresAtMs || extractTokenExpiryMs(tokenRef.current)
            if (!expMs || Date.now() > expMs - 120000) {
                const ok = await refresh()
                if (!ok) return null
            }
            const headers = { ...(opts.headers || {}) }
            if (tokenRef.current) headers['Authorization'] = 'Bearer ' + tokenRef.current
            let res = await fetch(API_URL + path, { ...opts, headers })

            // If token expired or rejected by server (401 or 405), refresh and retry once
            if (res.status === 401 || res.status === 405) {
                const refreshed = await refresh()
                if (refreshed && tokenRef.current) {
                    headers['Authorization'] = 'Bearer ' + tokenRef.current
                    res = await fetch(API_URL + path, { ...opts, headers })
                }
            }
            return res
        } else {
            return fetch(API_URL + path, { ...opts })
        }
    }, [ refresh ])

    const logout = useCallback(() => {
        localStorage.removeItem('session')
        setToken(null)
        tokenRef.current = null
        setLogged(false)
        window.location.href = '/'
    }, [])
    
    useEffect(() => {
        const stored = session.current
        const expMs = stored?.expiresAtMs || (stored?.expiresAt ? (stored.expiresAt > 100000000 ? stored.expiresAt * 1000 : stored.expiresAt * 60000) : 0)
        
        if (!expMs) {
            setToken(null)
            setLogged(false)
            return
        }

        const msRemaining = expMs - Date.now()
        if (msRemaining <= 10000) {
            refresh().then(ok => {
                if (!ok) logout()
            })
        } else {
            setLogged(true)
        }
    }, [])

    return { getSession, api, token, logged, updateToken, logout, refresh }
}
