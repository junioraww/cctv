import cameraUrl from './assets/camera.png'

const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
const cardBackground = isMobile ? { zIndex: 1, position: 'relative' } : { backdropFilter: 'blur(2px)' };

const darkTheme = {
    // Layout
    appContainer: { display: 'flex', minHeight: isMobile ? '100%' : '100vh', height: isMobile ? '100%' : 'auto', color: '#e2e8f0', fontFamily: 'Inter, sans-serif', width: '100%', maxWidth: '100%', overflowX: 'hidden', minWidth: 0, position: 'relative', zIndex: 1 },
    background: { position: 'fixed', inset: 0, width: '100%', height: '100%', background: 'url(' + cameraUrl + '), #1a202c', backgroundPosition: 'center', backgroundSize: isMobile ? '75px' : '150px', pointerEvents: 'none', zIndex: -1 },
    sidebar: { width: '250px', backgroundColor: isMobile ? '#0017' : '#ffffff06', 
              ...cardBackground, padding: '24px', display: 'flex', flexDirection: 'column',
              borderRight: isMobile ? 'none' : '1px solid #4a5568', transition: 'transform 0.2s ease-in-out', zIndex: 1 },
    mainContent: { flex: 1, display: 'flex', flexDirection: 'column', transition: 'margin-left 0.2s ease-in-out', maxWidth: '100vw', overflowX: 'hidden', minWidth: 0 },
    header: { zIndex: 50, position: 'relative', backgroundColor: '#ffffff06', ...cardBackground, padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #4a5568', boxSizing: 'border-box', overflow: 'visible' },
    pageContent: { flex: 1, padding: '32px 0 40px 0', overflowY: 'auto' },
    pageWrapper: { width: '100%', maxWidth: '1280px', margin: '0 auto', padding: '0 32px', boxSizing: 'border-box' },
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 99, cursor: 'pointer', transition: 'opacity 0.2s ease-in-out' },
    
    // Mobile specific styles
    sidebarMobile: { position: 'fixed', height: '100%', transform: 'translateX(-100%)' },
    sidebarMobileOpen: { transform: 'translateX(0)', zIndex: 100 },
    mainContentMobile: { marginLeft: '0' },
    hamburgerButton: { background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', zIndex: 50 },
    pageContentMobile: { padding: '16px 0 24px 0' },
    pageWrapperMobile: { padding: '0 16px 24px 16px' },
    headerMobile: { padding: '12px 16px', position: 'relative', zIndex: 50, overflow: 'visible' },
    
    // Auth Page
    authContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'transparent', position: 'relative', zIndex: 1, padding: '16px', boxSizing: 'border-box' },
    authCard: { backgroundColor: 'rgba(26, 32, 44, 0.88)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: '32px', borderRadius: '16px', border: '1px solid #4a5568', width: '100%', maxWidth: '420px', boxSizing: 'border-box', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)', transition: 'opacity 0.1s ease-in-out' },
    authTitle: { fontSize: '1.8rem', fontWeight: 'bold', textAlign: 'center', color: '#fff', margin: '0' },
    authSubtitle: { textAlign: 'center', color: '#a0aec0', marginBottom: '24px' },
    authButtonGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' },
    authError: { color: '#f56565', marginBottom: '16px', textAlign: 'center' },
    authLink: { background: 'none', border: 'none', color: '#4299e1', cursor: 'pointer', textDecoration: 'underline', padding: 0 },
    fingerprintText: { fontSize: '0.8rem', color: '#718096', textAlign: 'center', marginTop: '16px', fontFamily: 'monospace' },
    
    // QR Scanner
    qrScannerContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
    qrVideo: { borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', width: '100%', maxWidth: '400px' },
    qrError: { color: '#f56565' },
    qrText: { color: '#a0aec0' },

    // Verify Code Modal
    modalBackdrop: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
    modalContent: { backgroundColor: '#ffffff06', ...cardBackground, padding: '32px', borderRadius: '16px', border: '1px solid #4a5568', width: '100%', maxWidth: '400px' },
    modalActions: { display: 'flex', gap: '12px', marginTop: '16px' },

    // Components
    sidebarTitle: { fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', marginBottom: '32px', alignSelf: 'center' },
    navLink: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', textDecoration: 'none',
               color: isMobile ? '#fff' : '#a0aec0', marginBottom: '8px', transition: 'background-color 0.2s, color 0.2s' },
    navLinkActive: { backgroundColor: '#4299e1', color: '#fff' },
    headerTitle: { fontSize: '1.8rem', margin: '0 0 5px 0', fontWeight: 'bold', color: '#fff' },
    groupSelect: { backgroundColor: '#4a5568', color: '#e2e8f0', border: '1px solid #718096', borderRadius: '8px', padding: '8px 12px', fontSize: '1rem', cursor: 'pointer' },
    card: { backgroundColor: '#ffffff06', ...cardBackground, padding: '24px', borderRadius: '12px', border: '1px solid #4a5568' },
    h2: { fontSize: '1.5rem', fontWeight: '600', marginBottom: '24px', color: '#fff' },
    h3: { fontSize: '1.2rem', fontWeight: '600', margin: '0', color: '#fff' },
    button: { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', transition: 'background-color 0.2s, transform 0.1s' },
    buttonPrimary: { backgroundColor: '#4299e1', color: '#fff' },
    buttonSecondary: { backgroundColor: '#4a5568', color: '#e2e8f0' },
    buttonDanger: { backgroundColor: '#c53030', color: '#fff' },
    input: { display: 'flex', width: '100%', boxSizing: 'border-box', backgroundColor: '#1a202c', border: '1px solid #4a5568', borderRadius: '8px', padding: '12px', color: '#e2e8f0', fontSize: '1rem' },
    fileInput: { padding: '8px' },
    label: { display: 'block', marginBottom: '8px', color: '#a0aec0', fontWeight: '500' },
    flexColumnGap10: { display: 'flex', flexDirection: 'column', gap: '10px' },
    noDecor: { textDecoration: 'none' },
    
    // Dashboard
    dashboardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' },
    dashboardStatsGrid: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' },
    dashboardStatValue: { fontWeight: 'bold' },
    cameraListItem: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #4a5568' },
    cameraStatus: { display: 'flex', alignItems: 'center' },
    cameraStatusDot: { width: '8px', height: '8px', borderRadius: '50%', marginRight: '8px' },
    
    cameraGridBase: { display: 'grid', gap: '16px', width: '100%' },
    grid1: { gridTemplateColumns: '1fr' },
    grid2: { gridTemplateColumns: '1fr 1fr' },
    grid4: { gridTemplateColumns: '1fr 1fr' },
    cameraGridItem: { width: '100%', aspectRatio: '16 / 9' },
    cameraControls: { display: 'flex', gap: '12px' },
    cameraSelector: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
    mobileCameraList: { display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' },
    mobileCameraItem: { width: '100%', aspectRatio: '16 / 9' },

    // Video Player
    videoPlayerContainer: { position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', touchAction: 'pan-y' },
    videoElement: { width: '100%', height: '100%', objectFit: 'contain' },
    videoOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '10', pointerEvents: 'none' },
    videoLoader: { width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' },
    videoPlayButton: { background: 'rgba(0,0,0,0.5)', border: '2px solid white', color: 'white', cursor: 'pointer', borderRadius: '50%', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    videoLatency: { position: 'absolute', top: '8px', left: '8px', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', zIndex: '20' },
    zoomResetBadge: { position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(49, 130, 206, 0.85)', color: 'white', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '4px', zIndex: '25', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', backdropFilter: 'blur(4px)' },
    videoControlsContainer: { position: 'absolute', bottom: '8px', left: '8px', right: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '12px', padding: '8px 12px', transition: 'opacity 0.3s', zIndex: '20' },
    videoControlsGroup: { display: 'flex', alignItems: 'center', gap: '12px' },
    videoControlButton: { background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, display: 'flex', opacity: 1, transform: 'opacity 0.1s' },
    videoPtzPanel: { position: 'absolute', top: '8px', right: '8px', display: 'grid', gridTemplateColumns: 'repeat(3, 32px)', gridTemplateRows: 'repeat(3, 32px)', alignItems: 'center', justifyContent: 'center', gap: '4px', backgroundColor: 'rgba(0,0,0,0.5)', padding: '8px', borderRadius: '12px', transition: 'opacity 0.3s', zIndex: '20' },
    
    
    // Participants
    participantList: { listStyle: 'none', padding: 0, margin: 0 },
    participantListItem: { display: 'flex', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #4a5568' },
    participantAvatarContainer: { width: '48px', height: '48px', minWidth: '48px', minHeight: '48px', maxWidth: '48px', maxHeight: '48px', flexShrink: 0, aspectRatio: '1 / 1', borderRadius: '50%', overflow: 'hidden', marginRight: '16px', backgroundColor: '#4a5568' },
    participantAvatarImage: { width: '100%', height: '100%', objectFit: 'cover' },
    participantAvatarPlaceholder: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' },
    participantName: { fontWeight: '600', color: '#fff' },
    participantLastSeen: { color: '#a0aec0', fontSize: '0.9rem' },
    
    // Settings
    settingsTabs: { zIndex: 1, position: 'relative', display: 'flex', gap: '16px', borderBottom: '1px solid #4a5568', marginBottom: '24px' },
    settingsTabButton: { padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: '600', borderBottom: '2px solid transparent' },
    settingsTabButtonActive: { color: '#4299e1', borderBottom: '2px solid #4299e1' },
    settingsTabButtonInactive: { color: '#a0aec0' },
    profileView: { display: 'flex', alignItems: 'center', gap: '24px' },
    profileAvatar: { width: '80px', height: '80px', minWidth: '80px', minHeight: '80px', maxWidth: '80px', maxHeight: '80px', flexShrink: 0, aspectRatio: '1 / 1', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#4a5568' },
    profileAvatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
    profileAvatarPlaceholder: { fontSize: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
    profileName: { fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' },
    profileEditButton: { background: 'none', border: 'none', color: '#4299e1', cursor: 'pointer', padding: 0, textDecoration: 'underline' },
    formRow: { marginBottom: '16px' },
    formActions: { display: 'flex', gap: '12px' },
    sessionListItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, borderBottom: '1px solid #4a5568' },
    sessionInfo: { fontWeight: '600', color: '#fff' },
    sessionMeta: { color: '#a0aec0', fontSize: '0.9rem' },
    sessionCurrentBadge: { color: '#48bb78', fontSize: '0.9rem' },
    logoutButton: {  backgroundColor: '#c53030', color: '#fff', opacity: 0.7, marginLeft: '20px', flex: '0 0 110px', animation: 'opacity 0.2s' },
    
    // New stuff
    themeContainer: { display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#f5f5f5', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    },
    themeButtonBase: { padding: '10px 18px', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease-in-out',
    },
    themeButtonLight: { background: '#ffffff', color: '#333', border: '1px solid #ccc', },
    themeButtonDark: { background: '#1e1e1e', color: '#fff', border: '1px solid #444', },
};

const styles = { ...darkTheme };

export default styles;
