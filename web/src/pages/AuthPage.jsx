import React, { useEffect, useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import styles from '../styles'

async function getFingerprint() {
  try {
    const ua = navigator.userAgent || ''
    const platform = navigator.platform || ''
    const languages = navigator.languages ? navigator.languages.join(',') : navigator.language || ''
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext && canvas.getContext('2d')
    let canvasHash = ''
    if (ctx) {
      canvas.width = 200
      canvas.height = 50
      ctx.textBaseline = 'middle'
      ctx.font = "14px 'Arial'"
      ctx.fillStyle = '#f60'
      ctx.fillRect(0, 0, 200, 50)
      ctx.fillStyle = '#069'
      ctx.fillText(ua.slice(0, 50), 2, 25)
      const data = canvas.toDataURL()
      canvasHash = btoa(data).slice(0, 12)
    }

    const raw = [ua, platform, languages, timezone, canvasHash].join('||')
    let h = 0
    for (let i = 0; i < raw.length; i++) h = (h << 5) - h + raw.charCodeAt(i) | 0
    return `fp_${Math.abs(h)}_${canvasHash}`
  } catch (e) {
    return 'fp_fallback'
  }
}

export function extractNonce(str) {
    if (!str || typeof str !== 'string') return '';
    let val = str.trim();

    // 1. If code contains /invite/xxxxxx
    if (val.includes('/invite/')) {
        const after = val.split('/invite/')[1];
        if (after) {
            val = after.split(/[/?#]/)[0];
        }
    }

    // 2. If code contains ?invite=xxxxxx
    if (val.includes('invite=')) {
        try {
            const url = new URL(val.startsWith('http') ? val : `https://dummy/${val}`);
            const queryVal = url.searchParams.get('invite');
            if (queryVal) val = queryVal;
        } catch (e) {
            const match = val.match(/[?&]invite=([a-fA-F0-9]+)/);
            if (match) val = match[1];
        }
    }

    // 3. If code is legacy dot-separated: 0000.NONCE.timestamp
    if (val.includes('.')) {
        const parts = val.split('.');
        if (parts.length >= 2 && parts[1].length === 8) {
            val = parts[1];
        }
    }

    // 4. Extract 8-char hex string if embedded in text/url
    const hexMatch = val.match(/[a-fA-F0-9]{8}/);
    if (hexMatch) {
        return hexMatch[0];
    }

    return val;
}

export default function AuthPage({ api, onLogin, inviteNonce }) {
    const [ step, setStep ] = useState('start'); // start | qr | login | register
    const [ group, setGroup ] = useState(null);
    const [ transition, setTransition ] = useState(false);
    const [ scanError, setScanError ] = useState(null);
    const [ scanningLoading, setScanningLoading ] = useState(false);
    const isScanningRef = useRef(false);

    const fadeToStep = (s) => {
        setTransition(true);
        setTimeout(() => { setStep(s); setTransition(false); }, 200);
    };

    const handleScan = async ({ nonce }) => {
        if (!nonce) return;
        const cleanNonce = extractNonce(nonce);
        if (!cleanNonce || cleanNonce.length !== 8) {
            setScanError('Неверный код (должен содержать 8 символов)');
            return;
        }

        if (isScanningRef.current) return;
        isScanningRef.current = true;
        setScanningLoading(true);
        setScanError(null);

        try {
            const res = await api(`invites/${cleanNonce}/accept`, false, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (data.error) {
                const msg = data.error === 'Invalid nonce'
                    ? 'Код приглашения недействителен или истек'
                    : data.error === 'Invite Used'
                    ? 'Это приглашение уже было использовано'
                    : data.error;
                setScanError(msg);
                fadeToStep('start');
            } else {
                setGroup(data.group);
                fadeToStep('register');
            }
        } catch (e) {
            console.error(e);
            setScanError('Ошибка при проверке кода приглашения');
            fadeToStep('start');
        } finally {
            setScanningLoading(false);
            isScanningRef.current = false;
        }
    };

    // Auto-detect invite code from URL /invite/:code or ?invite=:code
    useEffect(() => {
        let code = inviteNonce;
        const pathname = window.location.pathname;
        if (!code && pathname.startsWith('/invite/')) {
            code = pathname.split('/invite/')[1]?.split('/')[0]?.split('?')[0];
        }
        if (!code) {
            const params = new URLSearchParams(window.location.search);
            code = params.get('invite');
        }

        if (code) {
            handleScan({ nonce: code });
        }
    }, [ inviteNonce ]);
    
    const renderContent = () => {
        switch(step) {
            case 'start':
                return (
                    <>
                        <h2 style={styles.authTitle}>Приветствуем!</h2>
                        <p style={styles.authSubtitle}>Отсканируйте приглашение или войдите в аккаунт.</p>
                        {scanError && <p style={{ ...styles.authError, margin: '8px 0 16px 0' }}>{scanError}</p>}
                        <div style={styles.authButtonGrid}>
                            <button style={{...styles.button, ...styles.buttonPrimary}} onClick={() => { setScanError(null); fadeToStep('qr'); }}>Сканировать QR</button>
                            <button style={{...styles.button, ...styles.buttonSecondary}} onClick={() => { setScanError(null); fadeToStep('login'); }}>Войти</button>
                        </div>
                    </>
                );
            case 'qr':
                return (
                    <>
                         <QRScanner onScan={handleScan} error={scanError} loading={scanningLoading} />
                         <div style={{marginTop: '16px'}}>
                            <button style={styles.authLink} onClick={() => { setScanError(null); fadeToStep('start'); }}>Назад</button>
                         </div>
                    </>
                );
            case 'login':
            case 'register':
                return (
                    <>
                        <AuthForm api={api} group={group} onLogin={onLogin} isRegister={step === 'register'} />
                        <div style={{marginTop: '16px', textAlign: 'center'}}>
                           <button style={styles.authLink} onClick={() => { setGroup(null); fadeToStep('start'); }}>Назад</button>
                        </div>
                    </>
                );
            default:
                return null;
        }
    }

    return (
        <div className="auth-container" style={{ ...styles.authContainer, minHeight: '100dvh' }}>
            <div className="auth-card" style={{ ...styles.authCard, opacity: transition ? 0 : 1 }}>
                {renderContent()}
            </div>
        </div>
    );
}

function AuthForm({ api, group, onLogin, isRegister }) {
    const [ mode, setMode ] = useState(isRegister ? 'register' : 'login');
    const [ name, setName ] = useState('');
    const [ avatar, setAvatar ] = useState(null);
    const [ email, setEmail ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ error, setError ] = useState(null);
    const [ loading, setLoading ] = useState(false);
    const [ fp, setFp ] = useState(null);

    const activeIsRegister = group ? mode === 'register' : isRegister;

    useEffect(() => {
        let mounted = true;
        getFingerprint().then(f => { if (mounted) setFp(f); }).catch(() => {});
        return () => { mounted = false; };
    }, []);

    const onAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const MAX_DIM = 512;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (w > h && w > MAX_DIM) { h = (h / w) * MAX_DIM; w = MAX_DIM; }
            else if (h >= w && h > MAX_DIM) { w = (w / h) * MAX_DIM; h = MAX_DIM; }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setAvatar(dataUrl);
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        
        try {
            const endpoint = activeIsRegister ? 'users' : 'auth/login';
            const body = activeIsRegister ? 
                { name, avatar, email, password, fingerprint: fp, groupId: group?.id, nonce: group?.nonce, inviteId: group?.inviteId } : 
                { email, password, fingerprint: fp, nonce: group?.nonce, inviteId: group?.inviteId };
            
            const res = await api(endpoint, false, { method: 'POST', body: JSON.stringify(body), credentials: 'include' });
            const data = await res.json();

            if (data.error) {
                setError(data.error);
            } else if (data.token) {
                onLogin(data);
            } else {
                 setError('Произошла ошибка. Попробуйте снова.');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <form onSubmit={handleSubmit}>
            <h2 style={styles.authTitle}>
                {group 
                    ? (mode === 'register' ? 'Регистрация' : 'Вход в систему') 
                    : (isRegister ? 'Регистрация' : 'Вход в систему')}
            </h2>

            {group && (
                <div style={{
                    backgroundColor: 'rgba(66, 153, 225, 0.15)',
                    border: '1px solid #4299e1',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '16px',
                    textAlign: 'center',
                    fontSize: '0.9rem',
                    color: '#e2e8f0'
                }}>
                    Присоединение к группе <b>«{group.name}»</b>
                    {group.isTemporary && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', color: '#ecc94b', fontSize: '0.8rem', marginTop: '6px' }}>
                            <ClockIcon size={13} color="#ecc94b" />
                            <span>Временный доступ ({Math.round(group.durationMinutes / 60)} ч.)</span>
                        </div>
                    )}
                </div>
            )}

            {group && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', background: 'rgba(255,255,255,0.06)', padding: '4px', borderRadius: '8px' }}>
                    <button
                        type="button"
                        onClick={() => { setMode('register'); setError(null); }}
                        style={{
                            flex: 1,
                            padding: '8px 10px',
                            border: 'none',
                            borderRadius: '6px',
                            background: mode === 'register' ? '#3182ce' : 'transparent',
                            color: mode === 'register' ? '#fff' : '#a0aec0',
                            fontWeight: mode === 'register' ? '600' : '400',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Новый аккаунт
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode('login'); setError(null); }}
                        style={{
                            flex: 1,
                            padding: '8px 10px',
                            border: 'none',
                            borderRadius: '6px',
                            background: mode === 'login' ? '#3182ce' : 'transparent',
                            color: mode === 'login' ? '#fff' : '#a0aec0',
                            fontWeight: mode === 'login' ? '600' : '400',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Уже есть аккаунт
                    </button>
                </div>
            )}
            
            {activeIsRegister && (
                <>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                        <div style={{ width: '74px', height: '74px', borderRadius: '50%', overflow: 'hidden', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                            <Avatar src={avatar} name={name || 'Пользователь'} size={74} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input id="reg-avatar-input" type="file" accept="image/*" onChange={onAvatarChange} style={{ display: 'none' }} />
                            <label htmlFor="reg-avatar-input" style={{ ...styles.button, ...styles.buttonSecondary, padding: '6px 12px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                {avatar ? 'Сменить фото' : 'Выбрать фото'}
                            </label>
                            {avatar && (
                                <button type="button" onClick={() => setAvatar(null)} style={{ ...styles.button, ...styles.buttonDanger, padding: '6px 10px', fontSize: '0.85rem' }}>
                                    Сбросить
                                </button>
                            )}
                        </div>
                    </div>

                    <div style={styles.formRow}>
                        <label style={styles.label}>Ваше имя</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Иван" style={styles.input} required />
                    </div>
                </>
            )}

            <div style={styles.formRow}>
                <label style={styles.label}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@domain.com" style={styles.input} required />
            </div>

            <div style={styles.formRow}>
                <label style={styles.label}>Пароль</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={styles.input} required />
            </div>

            {error && <p style={styles.authError}>{error}</p>}
            
            <button type="submit" disabled={loading} style={{...styles.button, ...styles.buttonPrimary, width: '100%', marginTop: '8px'}}>
                {loading 
                    ? 'Загрузка...' 
                    : (group 
                        ? (mode === 'register' ? 'Зарегистрироваться и войти' : 'Войти и присоединиться') 
                        : (activeIsRegister ? 'Зарегистрироваться' : 'Войти'))}
            </button>
            <p style={styles.fingerprintText}>{fp ? fp.slice(0, 32) : '...генерируется'}</p>
        </form>
    );
}

function QRScanner({ onScan, error: parentError, loading }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [activated, setActivated] = useState(false);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!window.jsQR) {
        setError("Библиотека jsQR не загрузилась!");
        return;
    }

    let mounted = true;
    let stream;
    let raf;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext && canvas.getContext('2d');

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!mounted) {
          if (stream) stream.getTracks().forEach(t => t.stop());
          return;
        }
        video.srcObject = stream;
        video.setAttribute('playsinline', true);
        await video.play().catch(() => {});
        if (!mounted) return;
        setActivated(true);

        const tick = () => {
          if (!mounted || scannedRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
              if (code && code.data && !scannedRef.current) {
                scannedRef.current = true;
                // Stop camera stream immediately to prevent repeated detections!
                if (stream) {
                  stream.getTracks().forEach(t => t.stop());
                }
                const clean = extractNonce(code.data);
                onScan({ nonce: clean });
                return; // Cease RAF loop!
              }
            } catch (e) { /* ignore */ }
          }
          if (!scannedRef.current) {
            raf = requestAnimationFrame(tick);
          }
        };
        tick();
      } catch (e) {
        if (mounted) setError('Камера недоступна');
      }
    }

    start();
    return () => {
      mounted = false;
      scannedRef.current = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <div style={styles.qrScannerContainer}>
      {!activated && !error && !loading && <p style={styles.qrText}>Активация камеры...</p>}
      {loading && <p style={{ color: '#4299e1', fontWeight: 600, margin: '8px 0' }}>Проверка приглашения...</p>}
      <video ref={videoRef} style={{ ...styles.qrVideo, ...(loading ? { opacity: 0.5 } : {}) }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {(error || parentError) && <p style={styles.authError}>{error || parentError}</p>}
      {!loading && <p style={styles.qrText}>Отсканируйте QR код группы</p>}
      
      {manual ? (
          <div style={{width: '100%'}}>
            <input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Введите код или вставьте ссылку"
              style={{...styles.input, marginBottom: '8px'}}
            />
            <button
              onClick={() => onScan({ nonce: manualCode })}
              disabled={loading}
              style={{...styles.button, ...styles.buttonPrimary, width: '100%'}}
            >
              {loading ? 'Проверка...' : 'Активировать'}
            </button>
          </div>
      ) : (
          <button onClick={() => setManual(true)} style={styles.authLink}>Ввести код вручную</button>
      )}
    </div>
  );
}

function ClockIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  );
}
