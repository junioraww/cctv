import React, { useState, useEffect } from 'react'
import styles from '../styles'

function getInitials(name) {
  if (!name || typeof name !== 'string') return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function Avatar({ src, alt, name, style, size }) {
  const [ loaded, setLoaded ] = useState(false)
  const [ error, setError ] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [ src ])

  const initials = getInitials(name || alt)
  const hasValidSrc = Boolean(src && typeof src === 'string' && src.trim() !== '')

  let cleanSrc = src
  if (hasValidSrc) {
    cleanSrc = src.trim()
    if (!cleanSrc.startsWith('/') && !cleanSrc.startsWith('http://') && !cleanSrc.startsWith('https://') && !cleanSrc.startsWith('data:')) {
      cleanSrc = '/' + cleanSrc
    }
  }

  const containerStyle = {
    ...styles.participantAvatarPlaceholder,
    backgroundColor: '#4a5568',
    color: '#fff',
    userSelect: 'none',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '50%',
    width: size ? `${size}px` : '100%',
    height: size ? `${size}px` : '100%',
    minWidth: size ? `${size}px` : '100%',
    minHeight: size ? `${size}px` : '100%',
    maxWidth: size ? `${size}px` : undefined,
    maxHeight: size ? `${size}px` : undefined,
    aspectRatio: '1 / 1',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style
  }

  // If no source or error loading, show clean initials fallback
  if (!hasValidSrc || error) {
    return (
      <div style={containerStyle} title={name || alt || ''}>
        <span style={{ fontSize: size ? `${Math.round(size * 0.4)}px` : '1.1rem', fontWeight: 600 }}>
          {initials}
        </span>
      </div>
    )
  }

  return (
    <div style={containerStyle} title={name || alt || ''}>
      {!loaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#4a5568',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              borderTopColor: '#4299e1',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      )}

      <img
        src={cleanSrc}
        alt={alt || name || 'avatar'}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{
          display: loaded ? 'block' : 'none',
          width: '100%',
          height: '100%',
          aspectRatio: '1 / 1',
          objectFit: 'cover',
          borderRadius: '50%',
          flexShrink: 0,
        }}
      />
    </div>
  )
}
