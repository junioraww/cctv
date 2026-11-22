import React, { useState, useMemo, useRef } from 'react'
import Avatar from '../components/Avatar'
import TimeAgo from '../utils/timeAgo'
import styles from '../styles'

export default function Settings({ api, _logout, groups, group, sessions, setSessions, getSession, onGroupUserChange }) {
  const groupData = useMemo(() => groups?.find(x => x.id === group) || null, [ groups, group ])
  
  const [ name, setName ] = useState(groupData?.member?.name || '')
  const [ avatar, setAvatar ] = useState(groupData?.member?.avatar || null)
  const [ activeTab, setActiveTab ] = useState('profile');
  const [ displayedTab, setDisplayedTab ] = useState('profile');
  const [ isEditing, setEditing ] = useState(false);
  const [ loading, setLoading ] = useState(false);
  const [ error, setError ] = useState(null);

  const animTimerRef = useRef(null);
  const touchRef = useRef({ startX: 0, startY: 0, tracking: false, isHoriz: false });

  const switchTab = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => {
      setDisplayedTab(tab);
    }, 290);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target.closest('button, input, label, a, textarea, select')) return;
    const t = e.touches[0];
    touchRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      tracking: true,
      isHoriz: false,
    };
  };

  const handleTouchMove = (e) => {
    if (!touchRef.current.tracking || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;

    if (!touchRef.current.isHoriz) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        touchRef.current.tracking = false;
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        // If on Profile and swiping right: let parent carousel swipe to Participants!
        if (activeTab === 'profile' && dx > 0) {
          touchRef.current.tracking = false;
          return;
        }
        // If on Sessions and swiping left: reached end of tabs, don't intercept
        if (activeTab === 'sessions' && dx < 0) {
          touchRef.current.tracking = false;
          return;
        }
        touchRef.current.isHoriz = true;
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchRef.current.tracking || !touchRef.current.isHoriz) {
      touchRef.current.tracking = false;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.startX;
    touchRef.current.tracking = false;

    if (activeTab === 'profile' && dx < -35) {
      switchTab('sessions');
    } else if (activeTab === 'sessions' && dx > 35) {
      switchTab('profile');
    }
  };

  const onSave = async () => {
    setLoading(true)
    setError(null)
    try {
      if (!group) throw new Error('Группа не выбрана')

      // 1. Смена имени
      const resName = await api(`/groups/${group}/member`, true, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!resName.ok) throw new Error('Не удалось сменить имя')

      // 2. Загрузка или сброс аватара
      let avatarUrl = avatar
      
      if (avatar && avatar.startsWith('data:image')) {
        const blob = await (await fetch(avatar)).blob()
        const form = new FormData()
        form.append('avatar', blob, 'avatar.jpeg')
        const resAvatar = await api(`/groups/${group}/member/avatar`, true, {
          method: 'PATCH',
          body: form
        })
        if (!resAvatar.ok) throw new Error('Не удалось загрузить аватар')
        const data = await resAvatar.json()
        avatarUrl = data.url
      } else if (!avatar && groupData?.member?.avatar) {
        // Сброс аватара
        const resAvatar = await api(`/groups/${group}/member/avatar`, true, {
          method: 'DELETE'
        })
        if (!resAvatar.ok) throw new Error('Не удалось сбросить аватар')
        avatarUrl = null
      }

      if (groupData?.member && onGroupUserChange) {
        onGroupUserChange({ ...groupData.member, name, avatar: avatarUrl })
      }
      setEditing(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const onFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const img = document.createElement('img')
    img.src = URL.createObjectURL(file)

    img.onload = () => {
      const MAX_DIM = 512
      let w = img.naturalWidth
      let h = img.naturalHeight

      if (w > h && w > MAX_DIM) { h = (h / w) * MAX_DIM; w = MAX_DIM }
      else if (h >= w && h > MAX_DIM) { w = (w / h) * MAX_DIM; h = MAX_DIM }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      
      ctx.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      setAvatar(dataUrl)
    }

    img.onerror = () => console.error('Не удалось загрузить изображение')
  }
  
  const disableSession = async session => {
    const response = await api(`sessions/${session.id}`, true, {
      method: 'DELETE',
    })
    const { success, error } = await response.json()
    
    if (success) {
        setSessions([...sessions].filter(s => s.id !== session.id))
    }
    else alert(error)
  }
  
  const logout = async session => {
    const response = await api(`sessions/${session.id}`, true, {
      method: 'DELETE',
    })
    const { success, error } = await response.json()
    
    if (success) {
        _logout()
        window.location.reload()
    }
    else alert(error)
  }
  
  const currentSession = useMemo(() => getSession()?.current, []);

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', paddingBottom: '24px' }}>
            <div style={styles.settingsTabs}>
                <button
                    type="button"
                    onClick={() => switchTab('profile')}
                    style={{
                        ...styles.settingsTabButton,
                        ...(activeTab === 'profile' ? styles.settingsTabButtonActive : styles.settingsTabButtonInactive)
                    }}
                >
                    Профиль
                </button>
                <button
                    type="button"
                    onClick={() => switchTab('sessions')}
                    style={{
                        ...styles.settingsTabButton,
                        ...(activeTab === 'sessions' ? styles.settingsTabButtonActive : styles.settingsTabButtonInactive)
                    }}
                >
                    Сессии
                </button>
            </div>

            <div
                style={{
                    overflow: 'hidden',
                    width: '100%',
                    touchAction: activeTab === 'sessions' ? 'pan-y' : 'pan-x pan-y',
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div
                    style={{
                        display: 'flex',
                        width: '200%',
                        transform: activeTab === 'profile' ? 'translateX(0%)' : 'translateX(-50%)',
                        transition: 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)',
                        alignItems: 'flex-start',
                    }}
                >
                    {/* Profile Panel */}
                    <div
                        style={{
                            width: '50%',
                            minWidth: '50%',
                            maxWidth: '50%',
                            boxSizing: 'border-box',
                            paddingRight: '8px',
                            height: (activeTab === 'profile' || displayedTab === 'profile') ? 'auto' : 0,
                            overflow: (activeTab === 'profile' || displayedTab === 'profile') ? 'visible' : 'hidden',
                        }}
                    >
                        <div style={styles.card}>
                            {error && <p style={{ ...styles.authError, marginBottom: '16px' }}>{error}</p>}
                            {isEditing ? (
                                <ProfileTab 
                                    name={name}
                                    setName={setName}
                                    avatar={avatar}
                                    setAvatar={setAvatar}
                                    onFileChange={onFileChange}
                                    onSave={onSave}
                                    setEditing={setEditing}
                                    loading={loading}
                                />
                            ) : (
                                <ProfileView 
                                    name={name}
                                    avatar={avatar}
                                    setEditing={setEditing}
                                    groupName={groupData?.name}
                                />
                            )}
                        </div>
                    </div>

                    {/* Sessions Panel */}
                    <div
                        style={{
                            width: '50%',
                            minWidth: '50%',
                            maxWidth: '50%',
                            boxSizing: 'border-box',
                            paddingLeft: '8px',
                            height: (activeTab === 'sessions' || displayedTab === 'sessions') ? 'auto' : 0,
                            overflow: (activeTab === 'sessions' || displayedTab === 'sessions') ? 'visible' : 'hidden',
                        }}
                    >
                        <div style={styles.card}>
                            <SessionsTab
                                sessions={sessions || []}
                                currentSession={currentSession}
                                disableSession={disableSession}
                                logout={logout}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProfileTab({ name, setName, avatar, setAvatar, onFileChange, onSave, setEditing, loading }) {
    return (
        <div>
            <h3 style={styles.h3}>Настройки профиля</h3>
            <form style={{ margin: '15px 0 0 0' }} onSubmit={(e) => { e.preventDefault(); onSave(); }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ width: '84px', height: '84px', borderRadius: '50%', overflow: 'hidden', marginBottom: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                        <Avatar src={avatar} name={name} size={84} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input onChange={onFileChange} type="file" accept="image/*" id="avatar-input" style={{ display: 'none' }} />
                        <label htmlFor="avatar-input" style={{ ...styles.button, ...styles.buttonSecondary, padding: '8px 14px', cursor: 'pointer', fontSize: '0.9rem' }}>
                            {avatar ? 'Сменить фото' : 'Выбрать фото'}
                        </label>
                        {avatar && (
                            <button
                                type="button"
                                onClick={() => setAvatar(null)}
                                style={{ ...styles.button, ...styles.buttonDanger, padding: '8px 12px', fontSize: '0.9rem' }}
                            >
                                Сбросить
                            </button>
                        )}
                    </div>
                </div>

                <div style={styles.formRow}>
                    <label style={styles.label} htmlFor="name-input">Имя в группе</label>
                    <input id="name-input" type="text" value={name} onChange={e => setName(e.target.value)} style={styles.input} required />
                </div>

                <div style={{ ...styles.formActions, marginTop: '20px' }}>
                    <button type="submit" disabled={loading} style={{ ...styles.button, ...styles.buttonPrimary }}>
                        {loading ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button type="button" onClick={() => setEditing(false)} style={{ ...styles.button, ...styles.buttonSecondary }}>
                        Отмена
                    </button>
                </div>
            </form>
        </div>
    );
}

function ProfileView({ name, avatar, setEditing, groupName }) {
    return (
        <div style={styles.profileView}>
            <div style={styles.profileAvatar}>
                <Avatar src={avatar} name={name} alt={name} size={80}/>
            </div>
            <div>
                <p style={{ ...styles.profileName, margin: 0 }}>{name || 'Участник'}</p>
                {groupName && <p style={{ fontSize: '0.85rem', color: '#a0aec0', margin: '4px 0 8px 0' }}>Группа: {groupName}</p>}
                <button onClick={() => setEditing(true)} style={{ ...styles.profileEditButton, ...styles.noDecor }}>Редактировать</button>
            </div>
        </div>
    );
}

function SessionsTab({ sessions, currentSession, disableSession, logout }) {
    return (<div>
         <h3 style={styles.h3}>Активные сессии</h3>
         <ul style={{listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column-reverse'}}>
            {sessions.map(session => {
                const latest = session.history?.[session.history?.length - 1] || {};
                const isCurrent = session.id === currentSession?.id;
                return (
                <li key={session.id} style={styles.sessionListItem}>
                   <div>
                     <p style={styles.sessionInfo}>
                        {session.history?.map(x => x.ip || x.val).filter(Boolean).join(', ') || 'Браузерная сессия'} 
                        {isCurrent && <span style={styles.sessionCurrentBadge}> (текущая)</span>}
                     </p>
                     <p style={styles.sessionMeta}>
                        Создана {TimeAgo({ unixTime: latest.at * 60000 }).toLowerCase()}, 
                        онлайн {session.active ? TimeAgo({ unixTime: session.active * 1000 }).toLowerCase() : "недавно"}
                     </p>
                   </div>
                   {!isCurrent ?
                    <Hoverable func={() => disableSession(session)} text="Завершить"/> :
                    <Hoverable func={() => logout(session)} text="Выйти"/>
                  }
                </li>
            )})}
         </ul>
    </div>)
}

function Hoverable({ func, text }) {
  const [ hovered, setHovered ] = useState(false);

  return (
    <button onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)} onClick={func}
            style={{ ...styles.button, ...styles.logoutButton, ...(hovered && { opacity: 1 }) }}>{ text }</button>
  );
}
