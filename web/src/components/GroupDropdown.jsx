import React, { useState, useRef, useEffect } from 'react'

export default function GroupDropdown({ groups = [], currentGroupId, onSelectGroup, isMobile }) {
  const [ isOpen, setIsOpen ] = useState(false)
  const containerRef = useRef(null)

  const currentGroup = groups.find(g => g.id === currentGroupId) || groups[0] || null

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('pointerdown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [ isOpen ])

  if (!groups || groups.length === 0) return null

  const isExpired = (group) => {
    const expiresAt = group?.member?.expiresAt
    return expiresAt && new Date(expiresAt) <= new Date()
  }

  const formatExpires = (group) => {
    const expiresAt = group?.member?.expiresAt
    if (!expiresAt) return null
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'Истек'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 24) return `${Math.max(1, hours)}\u00A0ч.`
    const days = Math.floor(hours / 24)
    return `${days}\u00A0дн.`
  }

  return (
    <div
      ref={containerRef}
      data-no-swipe="true"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        display: 'inline-block',
        maxWidth: isMobile ? '160px' : '220px',
        flexShrink: 0
      }}
    >
      <button
        type="button"
        data-no-swipe="true"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(prev => !prev)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: isMobile ? '6px 8px' : '8px 12px',
          backgroundColor: isOpen ? '#2d3748' : '#1a202c',
          border: '1px solid #4a5568',
          borderRadius: '8px',
          color: '#e2e8f0',
          cursor: 'pointer',
          fontSize: isMobile ? '0.8rem' : '0.9rem',
          fontWeight: '500',
          transition: 'background-color 0.15s ease',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          gap: '6px',
          boxSizing: 'border-box',
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', minWidth: 0 }}>
          <GroupIcon />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentGroup ? currentGroup.name : 'Группа'}
          </span>
          {currentGroup && isExpired(currentGroup) && (
            <span style={{
              fontSize: '0.65rem',
              backgroundColor: '#e53e3e',
              color: '#fff',
              borderRadius: '4px',
              padding: '1px 4px',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}>
              Истек
            </span>
          )}
          {currentGroup && !isExpired(currentGroup) && formatExpires(currentGroup) && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '0.65rem',
              backgroundColor: 'rgba(214, 158, 46, 0.2)',
              color: '#ecc94b',
              border: '1px solid rgba(214, 158, 46, 0.4)',
              borderRadius: '4px',
              padding: '1px 3px',
              fontWeight: '600',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}>
              <ClockIcon size={10} color="#ecc94b" />
              <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatExpires(currentGroup)}</span>
            </span>
          )}
        </div>
        <ChevronIcon isOpen={isOpen} />
      </button>

      {isOpen && (
        <div
          data-no-swipe="true"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 100,
            backgroundColor: '#1a202c',
            border: '1px solid #4a5568',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            minWidth: isMobile ? '160px' : '190px',
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ maxHeight: '220px', overflowY: 'auto', padding: 0, margin: 0 }}>
            {groups.map((g, idx) => {
              const selected = g.id === currentGroup?.id
              const expired = isExpired(g)
              const expTime = formatExpires(g)
              const isLast = idx === groups.length - 1

              return (
                <button
                  type="button"
                  key={g.id}
                  data-no-swipe="true"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectGroup(g.id)
                    setIsOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    margin: 0,
                    cursor: 'pointer',
                    backgroundColor: selected ? '#3182ce' : 'transparent',
                    color: selected ? '#ffffff' : expired ? '#a0aec0' : '#e2e8f0',
                    transition: 'background-color 0.12s ease',
                    gap: '8px',
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    textAlign: 'left',
                    boxSizing: 'border-box',
                    borderBottom: isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
                    touchAction: 'manipulation',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.backgroundColor = '#2d3748'
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', minWidth: 0 }}>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {g.name}
                    </span>
                    {expired && (
                      <span style={{
                        fontSize: '0.65rem',
                        backgroundColor: '#e53e3e',
                        color: '#fff',
                        borderRadius: '3px',
                        padding: '1px 4px',
                        flexShrink: 0,
                        whiteSpace: 'nowrap'
                      }}>
                        Истек
                      </span>
                    )}
                    {!expired && expTime && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontSize: '0.65rem',
                        backgroundColor: 'rgba(214, 158, 46, 0.2)',
                        color: selected ? '#ffffff' : '#ecc94b',
                        borderRadius: '3px',
                        padding: '1px 4px',
                        fontWeight: '600',
                        flexShrink: 0,
                        whiteSpace: 'nowrap'
                      }}>
                        <ClockIcon size={10} color={selected ? "#ffffff" : "#ecc94b"} />
                        <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{expTime}</span>
                      </span>
                    )}
                  </div>
                  {selected && <CheckIcon />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function GroupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  )
}

function ClockIcon({ size = 12, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  )
}

function ChevronIcon({ isOpen }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s ease',
      }}
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  )
}
