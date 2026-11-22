import React, { useState } from 'react'
import Avatar from '../components/Avatar'
import TimeAgo from '../utils/timeAgo'
import styles from '../styles'

export default function AccountPage({ user, groups = [], api, onJoinedGroup, onLogout, sessions = [], setSessions, getSession }) {
  const [ code, setCode ] = useState('')
  const [ loading, setLoading ] = useState(false)
  const [ error, setError ] = useState(null)
  const [ successMessage, setSuccessMessage ] = useState(null)

  const handleJoin = async (e) => {
    e?.preventDefault()
    if (!code || !code.trim()) return
    setError(null)
    setSuccessMessage(null)
    setLoading(true)

    try {
      let trimmed = code.trim()
      if (trimmed.includes('/invite/')) {
        trimmed = trimmed.split('/invite/')[1]?.split('/')[0]?.split('?')[0]
      }

      const res = await api(`invites/${trimmed}/join`, true, { method: 'POST' })
      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else {
        setSuccessMessage(`Вы успешно присоединились к группе «${data.group?.name}»!`)
        setCode('')
        if (onJoinedGroup) {
          setTimeout(() => onJoinedGroup(data.group?.id), 800)
        }
      }
    } catch (err) {
      setError(err.message || 'Ошибка подключения к группе')
    } finally {
      setLoading(false)
    }
  }

  const disableSession = async (session) => {
    try {
      const res = await api(`sessions/${session.id}`, true, { method: 'DELETE' })
      const data = await res.json()
      if (data.success && setSessions) {
        setSessions(prev => (prev || []).filter(s => s.id !== session.id))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const currentSession = getSession?.()?.current || {}
  const expiredGroups = groups.filter(g => g.member?.expiresAt && new Date(g.member.expiresAt) <= new Date())

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Profile Card */}
      <div style={{ ...styles.card, display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          <Avatar src={user?.avatar} name={user?.name || 'Пользователь'} size={72} />
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#fff' }}>{user?.name || 'Пользователь'}</h2>
          <p style={{ margin: '4px 0 0 0', color: '#a0aec0', fontSize: '0.9rem' }}>
            {user?.webAccounts?.email || user?.email || 'Аккаунт системы видеонаблюдения'}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          style={{ ...styles.button, ...styles.buttonDanger, padding: '8px 16px', fontSize: '0.9rem' }}
        >
          Выйти
        </button>
      </div>

      {/* No active groups banner */}
      <div style={{
        backgroundColor: 'rgba(237, 137, 54, 0.12)',
        border: '1px solid #ed8936',
        borderRadius: '12px',
        padding: '16px 20px',
        color: '#feebc8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <WarningIcon size={20} color="#fbd38d" />
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fbd38d' }}>У вас нет активных групп</h3>
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#e2e8f0', lineHeight: '1.5' }}>
          Чтобы просматривать камеры и участвовать в системе, введите код приглашения ниже или запросите ссылку у администратора группы в Telegram.
        </p>
      </div>

      {/* Join Group Card */}
      <div style={styles.card}>
        <h3 style={{ ...styles.h3, marginBottom: '14px' }}>Присоединиться к группе</h3>
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Код или ссылка приглашения"
              style={{ ...styles.input, flex: 1, minWidth: '200px' }}
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              style={{ ...styles.button, ...styles.buttonPrimary, padding: '10px 20px', whiteSpace: 'nowrap' }}
            >
              {loading ? 'Подключение...' : 'Присоединиться'}
            </button>
          </div>
          {error && <p style={{ ...styles.authError, margin: 0 }}>{error}</p>}
          {successMessage && <p style={{ color: '#48bb78', fontSize: '0.9rem', margin: 0 }}>{successMessage}</p>}
        </form>
      </div>

      {/* Expired Groups (if any) */}
      {expiredGroups.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ ...styles.h3, marginBottom: '12px' }}>Истекшие доступы</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {expiredGroups.map(g => (
              <div
                key={g.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#2d3748',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', color: '#e2e8f0' }}>{g.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#e53e3e', marginTop: '2px' }}>
                    Срок доступа истек {g.member?.expiresAt ? new Date(g.member.expiresAt).toLocaleDateString() : ''}
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', backgroundColor: '#742a2a', color: '#fed7d7', padding: '3px 8px', borderRadius: '4px' }}>
                  Неактивна
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions list */}
      {sessions && sessions.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ ...styles.h3, marginBottom: '14px' }}>Активные сессии устройства</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sessions.map(s => {
              const latest = s.history?.[s.history?.length - 1] || {}
              const isCurrent = s.id === currentSession?.id

              return (
                <li
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: '#1a202c',
                    borderRadius: '8px',
                    border: '1px solid #4a5568',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>
                      {s.history?.map(x => x.ip || x.val).filter(Boolean).join(', ') || 'Браузерная сессия'}
                      {isCurrent && <span style={{ color: '#63b3ed', fontSize: '0.8rem', marginLeft: '6px' }}>(текущая)</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '2px' }}>
                      Создана {TimeAgo({ unixTime: (latest.at || 0) * 60000 }).toLowerCase()}
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => disableSession(s)}
                      style={{ ...styles.button, ...styles.buttonSecondary, padding: '5px 10px', fontSize: '0.8rem' }}
                    >
                      Завершить
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function WarningIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  );
}
