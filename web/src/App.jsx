import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Router, route } from 'preact-router'

import Dashboard from './pages/Dashboard'
import Participants from './pages/Participants'
import Cameras from './pages/Cameras'
import Settings from './pages/Settings'
import AccountPage from './pages/AccountPage'

import GroupDropdown from './components/GroupDropdown'
import BottomNav from './components/BottomNav'
import useWebSocket from './hooks/useWebSocket'
import useAuth from './hooks/useAuth'
import AuthPage from './pages/AuthPage'
import styles from './styles'

export default function App() {
    const { getSession, api, token, logged, updateToken, logout, refresh } = useAuth();
    const [ stage, setStage ] = useState(null); // auth | main
    const [ user, setUser ] = useState(null);
    const [ group, setGroup ] = useState(null);
    const [ groups, setGroups ] = useState(null);
    const [ users, setUsers ] = useState(null);
    const [ sessions, setSessions ] = useState(null);
    const [ cameras, setCameras ] = useState([]);
    const [ currentPath, setCurrentPath ] = useState(typeof window !== 'undefined' ? (window.location.pathname.split('?')[0] || '/') : '/');
    const [ isMobile, setIsMobile ] = useState(window.innerWidth < 768);

    const removePreloader = () => {
        const preloader = document.getElementById('preloader')
        if (preloader) preloader.remove()
    }

    const fetchUserData = useCallback(async () => {
        try {
            const response = await api('users/me?fields=groups,sessions', true);
            if (!response.ok) throw new Error('Failed to fetch user data');
            const data = await response.json();
            const _user = data.user;
            const _groups = _user?.groups || [];
            const _sessions = _user?.sessions || [];
            
            setUser(_user);
            setGroups(_groups);
            setSessions(_sessions);
            
            if (_groups.length > 0) {
                const active = _groups.filter(g => !g.member?.expiresAt || new Date(g.member.expiresAt) > new Date());
                setGroup(prev => {
                    if (prev && active.some(g => g.id === prev)) return prev;
                    return active[0]?.id || null;
                });
            } else {
                setGroup(null);
            }
            setStage('main');
        } catch (e) {
            console.error("Auth Error:", e);
            updateToken(null);
            setStage('auth');
        } finally {
            removePreloader();
        }
    }, [ api, updateToken ]);

    useEffect(() => {
        if (logged === undefined) return;
        if (!logged) {
            setStage('auth');
            removePreloader();
        } else {
            fetchUserData();
        }
    }, [ logged ]);

    // Auto-join invite if user is already logged in and navigates to /invite/:code or ?invite=:code
    useEffect(() => {
        if (!logged || stage !== 'main') return;
        let code = null;
        const pathname = window.location.pathname;
        if (pathname.startsWith('/invite/')) {
            code = pathname.split('/invite/')[1]?.split('/')[0]?.split('?')[0];
        }
        if (!code) {
            const params = new URLSearchParams(window.location.search);
            code = params.get('invite');
        }

        if (code) {
            const clean = String(code).match(/[a-fA-F0-9]{8}/)?.[0];
            if (clean) {
                api(`invites/${clean}/join`, true, { method: 'POST' })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success && data.group) {
                            fetchUserData();
                            setGroup(data.group.id);
                            window.history.replaceState({}, '', '/');
                        }
                    })
                    .catch(err => console.error("Invite auto-join error:", err));
            }
        }
    }, [ logged, stage ]);

    useEffect(() => {
        if (!group || !token || !logged) return;
        
        let isActive = true;

        const fetchGroup = async () => {
            try {
                const response = await api(`groups/${group}?fields=cameras,users`, true);
                if (response.status === 403) {
                    const errData = await response.json().catch(() => ({}));
                    if (errData.expired) {
                        setGroups(prev => (prev || []).map(g => g.id === group ? { ...g, member: { ...g.member, expiresAt: new Date(0).toISOString() } } : g));
                    }
                    return;
                }
                if (!response.ok) throw new Error('Failed to fetch group data');
                const { group: _group } = await response.json();
                if (isActive) {
                    setUsers(_group.users || []);
                    setCameras(_group.cameras || []);
                }
            } catch (e) {
                console.error(e);
            } finally {
                removePreloader();
            }
        };

        fetchGroup();

        return () => {
            isActive = false;
        };
    }, [ group, token, logged ]);

    // Real-time WebSockets integration
    useWebSocket({
        token,
        groupId: group,
        onTokenExpired: refresh,
        onCameraStatus: ({ cameraId, ready }) => {
            setCameras(prev => (prev || []).map(c => c.id === cameraId ? { ...c, ready } : c));
        },
        onMemberUpdated: ({ member }) => {
            setUsers(prev => (prev || []).map(u => {
                if (u.id === member.id || u.userId === member.userId) {
                    return { ...u, ...member };
                }
                return u;
            }));
            setGroups(prev => (prev || []).map(g => {
                if (g.id === group && g.member && (g.member.id === member.id || g.member.userId === member.userId)) {
                    return { ...g, member: { ...g.member, ...member } };
                }
                return g;
            }));
        },
        onMemberRemoved: ({ memberId, userId: removedUid }) => {
            setUsers(prev => (prev || []).filter(u => u.id !== memberId && u.userId !== removedUid));
        },
        onAccessExpired: ({ groupId: expiredGid }) => {
            setGroups(prev => (prev || []).map(g => {
                if (g.id === expiredGid) {
                    return { ...g, member: { ...g.member, expiresAt: new Date(0).toISOString() } };
                }
                return g;
            }));
            fetchUserData();
        },
        onSessionRevoked: () => {
            console.warn("Session revoked by another client or server. Logging out...");
            logout();
        }
    });

    const swipeContainerRef = useRef(null);
    const isSwipingProgrammatically = useRef(false);
    const scrollRafRef = useRef(null);

    const navLinks = [
        { href: '/', label: 'Сводка', icon: DashboardNavIcon },
        { href: '/watch', label: 'Просмотр', icon: CameraNavIcon },
        { href: '/group', label: 'Участники', icon: UsersNavIcon },
        { href: '/settings', label: 'Настройки', icon: SettingsNavIcon },
    ];

    const slideStyle = useMemo(() => ({
        flex: '0 0 100%',
        width: '100%',
        minWidth: '100%',
        maxWidth: '100%',
        scrollSnapAlign: 'start',
        scrollSnapStop: 'always',
        boxSizing: 'border-box',
        padding: '16px 16px 24px 16px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        height: '100%',
        position: 'relative',
        zIndex: 1,
    }), []);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile && swipeContainerRef.current) {
                const idx = navLinks.findIndex(l => l.href === currentPath);
                if (idx !== -1) {
                    swipeContainerRef.current.scrollLeft = idx * swipeContainerRef.current.clientWidth;
                }
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [ currentPath ]);

    const onLogin = (data) => {
        updateToken(data);
        setStage(null);
    };

    const handleNavClick = (path) => {
        setCurrentPath(path);
        window.history.pushState(null, '', path);
        if (isMobile && swipeContainerRef.current) {
            const targetIdx = navLinks.findIndex(l => l.href === path);
            if (targetIdx !== -1) {
                isSwipingProgrammatically.current = true;
                swipeContainerRef.current.scrollTo({
                    left: targetIdx * swipeContainerRef.current.clientWidth,
                    behavior: 'smooth'
                });
                setTimeout(() => {
                    isSwipingProgrammatically.current = false;
                }, 350);
            }
        } else {
            route(path);
        }
    };

    const dragRef = useRef({
        isDown: false,
        startX: 0,
        startY: 0,
        startScrollLeft: 0,
        startTime: 0,
        isDragging: false,
        pointerId: null,
    });

    const finishParentSwipe = useCallback((dx, velocity, fromIndex) => {
        const container = swipeContainerRef.current;
        if (!container) return;
        const width = container.clientWidth || 1;
        const baseIndex = fromIndex !== undefined
            ? fromIndex
            : Math.round(dragRef.current.startScrollLeft / width);
        let targetIndex = baseIndex;
        const TOTAL_SLIDES = 4;
        if (dx < -width * 0.15 || velocity < -0.2) {
            targetIndex = Math.min(TOTAL_SLIDES - 1, baseIndex + 1);
        } else if (dx > width * 0.15 || velocity > 0.2) {
            targetIndex = Math.max(0, baseIndex - 1);
        }
        isSwipingProgrammatically.current = true;
        container.scrollTo({
            left: targetIndex * width,
            behavior: 'smooth'
        });
        const targetPath = navLinks[targetIndex]?.href || '/';
        if (targetPath !== currentPath) {
            setCurrentPath(targetPath);
            window.history.replaceState(null, '', targetPath);
        }
        setTimeout(() => {
            isSwipingProgrammatically.current = false;
        }, 350);
    }, [ navLinks, currentPath ]);

    const handlePointerDown = (e) => {
        // Crucial: Only initiate pointer dragging for mouse!
        // On touch screens, native CSS scroll-snap handles carousel gestures natively.
        if (e.pointerType !== 'mouse') return;
        if (e.button !== 0) return;
        const targetTag = e.target.tagName?.toLowerCase();
        if (targetTag === 'input' || targetTag === 'button' || targetTag === 'label' || targetTag === 'a' || targetTag === 'textarea' || targetTag === 'select' || e.target.closest('button, input, label, a, textarea, select, [data-no-swipe]')) {
            return;
        }

        const container = swipeContainerRef.current;
        if (!container) return;

        dragRef.current = {
            isDown: true,
            startX: e.clientX,
            startY: e.clientY,
            startScrollLeft: container.scrollLeft,
            startTime: Date.now(),
            isDragging: false,
            pointerId: e.pointerId,
        };
    };

    const handlePointerMove = (e) => {
        if (!dragRef.current.isDown) return;
        const container = swipeContainerRef.current;
        if (!container) return;

        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;

        if (!dragRef.current.isDragging) {
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
                dragRef.current.isDragging = true;
                isSwipingProgrammatically.current = true;
                try {
                    container.setPointerCapture(e.pointerId);
                } catch (err) {}
                container.style.cursor = 'grabbing';
            } else if (Math.abs(dy) > 10) {
                dragRef.current.isDown = false;
                return;
            }
        }

        if (dragRef.current.isDragging) {
            e.preventDefault();
            container.scrollLeft = dragRef.current.startScrollLeft - dx;
        }
    };

    const handlePointerUp = (e) => {
        if (!dragRef.current.isDown) return;
        dragRef.current.isDown = false;
        const container = swipeContainerRef.current;
        if (!container) return;

        if (dragRef.current.isDragging) {
            dragRef.current.isDragging = false;
            try {
                container.releasePointerCapture(e.pointerId);
            } catch (err) {}
            container.style.cursor = 'grab';

            const dx = e.clientX - dragRef.current.startX;
            const dt = Date.now() - dragRef.current.startTime;
            const velocity = dx / (dt || 1);
            finishParentSwipe(dx, velocity);
        } else {
            isSwipingProgrammatically.current = false;
        }
    };

    const handleSwipeScroll = (e) => {
        if (isSwipingProgrammatically.current || dragRef.current.isDragging) return;
        const container = swipeContainerRef.current;
        if (!container) return;
        if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = requestAnimationFrame(() => {
            const width = container.clientWidth;
            if (!width) return;
            const idx = Math.min(3, Math.max(0, Math.round(container.scrollLeft / width)));
            const targetPath = navLinks[idx]?.href || '/';
            setCurrentPath(prev => {
                if (targetPath !== prev) {
                    window.history.replaceState(null, '', targetPath);
                    return targetPath;
                }
                return prev;
            });
        });
    };

    useEffect(() => {
        const hasGroups = groups && groups.length > 0;
        if (!isMobile || !swipeContainerRef.current || !hasGroups) return;
        const idx = navLinks.findIndex(l => l.href === currentPath);
        if (idx > 0) {
            const timer = setTimeout(() => {
                if (swipeContainerRef.current) {
                    swipeContainerRef.current.scrollLeft = idx * swipeContainerRef.current.clientWidth;
                }
            }, 60);
            return () => clearTimeout(timer);
        }
    }, [ isMobile, stage, groups ]);

    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname.split('?')[0] || '/';
            setCurrentPath(path);
            if (isMobile && swipeContainerRef.current) {
                const idx = navLinks.findIndex(l => l.href === path);
                if (idx !== -1) {
                    isSwipingProgrammatically.current = true;
                    swipeContainerRef.current.scrollTo({
                        left: idx * swipeContainerRef.current.clientWidth,
                        behavior: 'smooth'
                    });
                    setTimeout(() => { isSwipingProgrammatically.current = false; }, 400);
                }
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [ isMobile ]);

    const onGroupUserChange = newMember => {
        const _users = JSON.parse(JSON.stringify(users || []));
        const member = _users.find(x => x.id === newMember.id);
        if (member) {
            member.name = newMember.name;
            if (newMember.avatar !== undefined) member.avatar = newMember.avatar;
            setUsers(_users);
        }
        
        const _groups = JSON.parse(JSON.stringify(groups || []));
        const grp = _groups.find(x => x.id === group);
        if (grp?.member) {
            grp.member.name = newMember.name;
            if (newMember.avatar !== undefined) grp.member.avatar = newMember.avatar;
            setGroups(_groups);
        }
    };

    if (stage === null) {
        return (
            <>
                <div style={styles.background}></div>
                <div style={styles.authContainer}><h2 style={styles.h2}>Загрузка...</h2></div>
            </>
        );
    }

    if (stage === 'auth') {
        return (
            <>
                <div style={styles.background}></div>
                <AuthPage api={api} onLogin={onLogin} />
            </>
        );
    }

    const activeGroups = useMemo(() => {
        return (groups || []).filter(g => !g.member?.expiresAt || new Date(g.member.expiresAt) > new Date());
    }, [ groups ]);

    const currentGroupObj = groups?.find(g => g.id === group);
    const isCurrentGroupExpired = currentGroupObj?.member?.expiresAt && new Date(currentGroupObj.member.expiresAt) <= new Date();
    const hasNoGroups = activeGroups.length === 0;

    useEffect(() => {
        if (!groups) return;
        const active = groups.filter(g => !g.member?.expiresAt || new Date(g.member.expiresAt) > new Date());
        if (active.length > 0) {
            setGroup(prev => {
                if (prev && active.some(g => g.id === prev)) return prev;
                return active[0].id;
            });
        } else {
            setGroup(null);
        }
    }, [ groups ]);

    return (
        <div style={{
            ...styles.appContainer,
            ...(isMobile ? {
                height: '100%',
                minHeight: '100%',
                maxHeight: '100%',
                overflow: 'hidden',
                flexDirection: 'column'
            } : {
                minHeight: '100vh'
            })
        }}>
            <div style={styles.background}></div>

            {/* Desktop Sidebar (hidden on mobile) */}
            {!isMobile && (
                <aside style={styles.sidebar}>
                    <h1 style={styles.sidebarTitle}>CCTV System</h1>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {navLinks.map(link => {
                            const isActive = currentPath === link.href;
                            const Icon = link.icon;
                            return (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    onClick={(e) => { e.preventDefault(); handleNavClick(link.href); }}
                                    style={{
                                        ...styles.navLink,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        ...(isActive && styles.navLinkActive)
                                    }}
                                >
                                    <Icon active={isActive} />
                                    <span>{link.label}</span>
                                </a>
                            );
                        })}
                    </nav>
                </aside>
            )}

            <div style={{ ...styles.mainContent, maxWidth: '100vw', overflowX: 'hidden', minWidth: 0, ...(isMobile ? { ...styles.mainContentMobile, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}) }}>
                <header style={isMobile ? { ...styles.header, ...styles.headerMobile, flexShrink: 0, justifyContent: 'space-between', gap: '8px', position: 'relative', zIndex: 50, overflow: 'visible' } : { ...styles.header, flexShrink: 0, position: 'relative', zIndex: 50, overflow: 'visible' }}>
                    <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1, marginRight: '8px' }}>
                        <h2 style={{
                            ...styles.headerTitle,
                            color: '#ffffff',
                            ...(isMobile ? {
                                fontSize: '1.25rem',
                                fontWeight: '700',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                margin: 0
                            } : {})
                        }}>
                            {hasNoGroups
                                ? 'Личный кабинет'
                                : (navLinks.find(l => l.href === currentPath)?.label ||
                                   navLinks.find(l => l.href !== '/' && currentPath.startsWith(l.href))?.label ||
                                   'Сводка')}
                        </h2>
                    </div>

                    {!hasNoGroups && (
                        <GroupDropdown
                            groups={groups || []}
                            currentGroupId={group}
                            onSelectGroup={(newGid) => setGroup(newGid)}
                            isMobile={isMobile}
                        />
                    )}
                </header>

                {/* Expired group warning banner */}
                {!hasNoGroups && isCurrentGroupExpired && (
                    <div style={{
                        backgroundColor: '#742a2a',
                        color: '#fed7d7',
                        padding: '12px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        borderBottom: '1px solid #9b2c2c',
                        zIndex: 10
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AppClockIcon size={16} color="#fed7d7" />
                            <span>Срок действия временного доступа к группе <b>«{currentGroupObj?.name}»</b> истек.</span>
                        </div>
                    </div>
                )}

                <main style={isMobile ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', padding: 0 } : styles.pageContent}>
                    {hasNoGroups ? (
                        <div style={isMobile ? styles.pageWrapperMobile : styles.pageWrapper}>
                            <AccountPage
                                user={user}
                                groups={groups || []}
                                api={api}
                                onJoinedGroup={() => fetchUserData()}
                                onLogout={logout}
                                sessions={sessions}
                                setSessions={setSessions}
                                getSession={getSession}
                            />
                        </div>
                    ) : isMobile ? (
                        <div
                            ref={swipeContainerRef}
                            className="swipe-container"
                            onScroll={handleSwipeScroll}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                width: '100%',
                                flex: 1,
                                minHeight: 0,
                                height: '100%',
                                overflowX: 'auto',
                                overflowY: 'hidden',
                                scrollSnapType: 'x mandatory',
                                WebkitOverflowScrolling: 'touch',
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none',
                                touchAction: 'pan-x pan-y',
                                cursor: 'grab',
                            }}
                        >
                            <div style={slideStyle}>
                                <Dashboard users={users || []} cameras={cameras} />
                            </div>
                            <div style={slideStyle}>
                                <Cameras api={api} group={group} cameras={cameras} isMobile={isMobile} />
                            </div>
                            <div style={slideStyle}>
                                <Participants users={users || []} />
                            </div>
                            <div style={slideStyle}>
                                <Settings
                                    api={api}
                                    _logout={logout}
                                    group={group}
                                    groups={groups}
                                    sessions={sessions}
                                    setSessions={setSessions}
                                    getSession={getSession}
                                    onGroupUserChange={onGroupUserChange}
                                />
                            </div>
                        </div>
                    ) : (
                        <div style={styles.pageWrapper}>
                            <Router onChange={e => setCurrentPath(e.url.split('?')[0])}>
                                <Dashboard path="/" users={users || []} cameras={cameras} />
                                <Cameras path="/watch" api={api} group={group} cameras={cameras} isMobile={isMobile} />
                                <Participants path="/group" users={users || []} />
                                <Settings
                                    path="/settings"
                                    api={api}
                                    _logout={logout}
                                    group={group}
                                    groups={groups}
                                    sessions={sessions}
                                    setSessions={setSessions}
                                    getSession={getSession}
                                    onGroupUserChange={onGroupUserChange}
                                />
                            </Router>
                        </div>
                    )}
                </main>
            </div>

            {/* Mobile Bottom Navigation Bar (fixed at bottom, strictly SVG icons) */}
            {isMobile && !hasNoGroups && (
                <BottomNav currentPath={currentPath} onNavigate={handleNavClick} />
            )}
        </div>
    );
}

function DashboardNavIcon({ active }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="3" width="7" height="9"></rect>
            <rect x="14" y="3" width="7" height="5"></rect>
            <rect x="14" y="12" width="7" height="9"></rect>
            <rect x="3" y="16" width="7" height="5"></rect>
        </svg>
    );
}

function CameraNavIcon({ active }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M23 7l-7 5 7 5V7z"></path>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
    );
}

function UsersNavIcon({ active }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
    );
}

function SettingsNavIcon({ active }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
    );
}

function AppClockIcon({ size = 16, color = "currentColor" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    );
}
