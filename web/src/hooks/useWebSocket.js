import { useEffect, useRef, useCallback } from 'react'

export default function useWebSocket({ token, groupId, onCameraStatus, onMemberUpdated, onMemberRemoved, onAccessExpired, onSessionRevoked, onTokenExpired }) {
  const wsRef = useRef(null)
  const tokenRef = useRef(token)
  tokenRef.current = token
  const reconnectTimeoutRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const stableTimerRef = useRef(null)
  const backoffRef = useRef(2000)
  const isConnectingRef = useRef(false)
  const groupIdRef = useRef(groupId)

  const callbacksRef = useRef({ onCameraStatus, onMemberUpdated, onMemberRemoved, onAccessExpired, onSessionRevoked, onTokenExpired })
  useEffect(() => {
    callbacksRef.current = { onCameraStatus, onMemberUpdated, onMemberRemoved, onAccessExpired, onSessionRevoked, onTokenExpired }
  }, [ onCameraStatus, onMemberUpdated, onMemberRemoved, onAccessExpired, onSessionRevoked, onTokenExpired ])

  // Update group subscription without dropping the WebSocket connection
  useEffect(() => {
    groupIdRef.current = groupId
    if (groupId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe_group', groupId }))
    }
  }, [ groupId ])

  // Keep WebSocket authentication in sync when access token refreshes
  useEffect(() => {
    if (token && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh_auth', token }))
    }
  }, [ token ])

  const connect = useCallback(() => {
    const curToken = tokenRef.current
    if (!curToken || isConnectingRef.current) return
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const mode = import.meta.env.MODE
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = mode === 'development' ? 'localhost:3033' : window.location.host
    // In production, route through /cctv-api/ws so any reverse proxy routes it through the existing /cctv-api/ location
    const path = mode === 'development' ? '/ws' : '/cctv-api/ws'
    const url = `${proto}//${host}${path}?token=${encodeURIComponent(curToken)}`

    try {
      isConnectingRef.current = true
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        isConnectingRef.current = false
        console.log('[WS] Connected successfully')

        // Only consider the connection stable and reset backoff if it stays connected for >5s
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current)
        stableTimerRef.current = setTimeout(() => {
          backoffRef.current = 2000
        }, 5000)

        if (groupIdRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe_group', groupId: groupIdRef.current }))
        }

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 15000)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'camera:status') {
            callbacksRef.current.onCameraStatus?.(msg)
          } else if (msg.type === 'member:updated') {
            callbacksRef.current.onMemberUpdated?.(msg)
          } else if (msg.type === 'member:removed') {
            callbacksRef.current.onMemberRemoved?.(msg)
          } else if (msg.type === 'access:expired') {
            callbacksRef.current.onAccessExpired?.(msg)
          } else if (msg.type === 'auth:revoked') {
            console.warn('[WS] Received auth:revoked notification from server')
            callbacksRef.current.onSessionRevoked?.()
          }
        } catch (e) {}
      }

      ws.onclose = async (event) => {
        console.log(`[WS] Closed: code=${event.code}, reason=${event.reason || 'none'}, wasClean=${event.wasClean}`)
        isConnectingRef.current = false
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current)
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)

        // Code 4001: Session revoked by user or admin; do NOT reconnect
        if (event.code === 4001) {
          console.warn('[WS] Session revoked by server, not reconnecting.')
          callbacksRef.current.onSessionRevoked?.()
          return
        }

        // Code 4002: Token expired on server; refresh token before reconnecting
        if (event.code === 4002 && callbacksRef.current.onTokenExpired) {
          console.log('[WS] Server reported expired token (4002), refreshing before reconnect...')
          const refreshed = await callbacksRef.current.onTokenExpired()
          if (!refreshed) {
            console.warn('[WS] Token refresh failed, stopping reconnect.')
            return
          }
        }

        if (!tokenRef.current) return // User logged out, do not reconnect

        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 1.5, 30000)

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }

      ws.onerror = (err) => {
        console.error('[WS] Socket error:', err)
        isConnectingRef.current = false
        try { ws.close() } catch (e) {}
      }
    } catch (e) {
      console.error('[WS] Connection init error:', e)
      isConnectingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (token) {
      connect()
    } else {
      // If token is cleared (logout), close existing connection
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        try { wsRef.current.close() } catch (e) {}
        wsRef.current = null
      }
      isConnectingRef.current = false
    }
  }, [ token, connect ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        try { wsRef.current.close() } catch (e) {}
        wsRef.current = null
      }
      isConnectingRef.current = false
    }
  }, [])
}
