import React from 'react'

export default function BottomNav({ currentPath, onNavigate }) {
  const tabs = [
    { href: '/', label: 'Сводка', icon: DashboardIcon },
    { href: '/watch', label: 'Просмотр', icon: CameraIcon },
    { href: '/group', label: 'Участники', icon: UsersIcon },
    { href: '/settings', label: 'Настройки', icon: SettingsIcon },
  ]

  return (
    <nav
      data-no-swipe="true"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        flexShrink: 0,
        position: 'relative',
        width: '100%',
        zIndex: 1000,
        boxSizing: 'border-box',
        height: '56px',
        minHeight: '56px',
        backgroundColor: 'rgba(26, 32, 44, 0.98)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 8px',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.4)',
        maxWidth: '100vw',
      }}
    >
      {tabs.map(tab => {
        const isActive = currentPath === tab.href || (tab.href !== '/' && currentPath?.startsWith(tab.href))
        const IconComponent = tab.icon

        return (
          <button
            key={tab.href}
            type="button"
            data-no-swipe="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(tab.href)
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              color: isActive ? '#63b3ed' : '#a0aec0',
              padding: '4px 0',
              height: '100%',
              transition: 'color 0.15s ease',
              position: 'relative',
              boxSizing: 'border-box',
              touchAction: 'manipulation',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              minWidth: 0,
            }}
          >
            <div style={{ transform: isActive ? 'scale(1.08)' : 'scale(1)', transition: 'transform 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconComponent active={isActive} />
            </div>
            <span
              style={{
                fontSize: '11px',
                lineHeight: '14px',
                fontWeight: isActive ? '600' : '500',
                marginTop: '3px',
                letterSpacing: '0.2px',
                color: isActive ? '#63b3ed' : '#e2e8f0',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                display: 'block',
              }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function DashboardIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="7" height="9"></rect>
      <rect x="14" y="3" width="7" height="5"></rect>
      <rect x="14" y="12" width="7" height="9"></rect>
      <rect x="3" y="16" width="7" height="5"></rect>
    </svg>
  )
}

function CameraIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M23 7l-7 5 7 5V7z"></path>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
    </svg>
  )
}

function UsersIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  )
}

function SettingsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  )
}
