import { useEffect, useRef, useState, useCallback, memo } from "react"
import styles from '../styles'

const VideoPlayer = ({ api, ready, groupId, token, url, ptzEndpoint, isMobile }) => {
  const hlsRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  /* re-rendering fix */
  const tokenRef = useRef(token);

  const [ isPlaying, setIsPlaying ] = useState(false);
  const [ hasAudio, setHasAudio ] = useState(false);
  const [ isMuted, setIsMuted ] = useState(true);
  const [ isFullscreen, setIsFullscreen ] = useState(false);
  const [ controlsVisible, setControlsVisible ] = useState(true);
  const [ latency, setLatency ] = useState(0);
  const [ isLoading, setIsLoading ] = useState(true);
  const [ autoplayBlocked, setAutoplayBlocked ] = useState(false);
  const [ transform, setTransform ] = useState({ scale: 1, x: 0, y: 0 });
  const transformRef = useRef(transform);
  
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  
  const gestureState = useRef({
    pointers: new Map(),
    lastMidpoint: null,
    lastDistance: 0,
  }).current;

  useEffect(() => {
    if (!url || !videoRef.current || !token) return;
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        lowLatencyMode: true,
        liveSyncDuration: 1,
        liveMaxLatencyDuration: 7,
        maxLiveSyncPlaybackRate: 1.5,
        xhrSetup: (xhr) => xhr.setRequestHeader("Authorization", "Bearer " + tokenRef.current)
      });
      const streamSrc = `${url}/index.m3u8?token=${encodeURIComponent(tokenRef.current)}`;
      hls.loadSource(streamSrc); 
      hls.attachMedia(videoRef.current);
      hlsRef.current = hls;
      hls.on(Hls.Events.BUFFER_CREATED, (eventName, data) => {
        const hasAudio = Object.keys(data.tracks).some(
          (sBufferName) => sBufferName === 'audio' || sBufferName === 'audiovideo'
        );
        
        setHasAudio(hasAudio);
      });
      return () => hls.destroy();
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = `${url}/index.m3u8?token=${encodeURIComponent(tokenRef.current)}`;
    }
  }, [ url ]);
  
  useEffect(() => {
    tokenRef.current = token;
  }, [ token ])

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => setAutoplayBlocked(true));
    }
  };

  const toggleMute = () => {
    if (!videoRef.current || !hasAudio) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const toggleFullscreen = async () => {
    const parentElement = videoRef.current?.parentElement;
    if (!parentElement) return;
    if (!document.fullscreenElement) {
      await parentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      await document.exitFullscreen();
    }
  };
  
  /* PTZ */
  const sendPTZ = async (action) => {
    if (!ptzEndpoint) return;
    try {
      await api(ptzEndpoint, true, {
        method: "POST",
        body: JSON.stringify({ groupId: groupId, action }),
      });
    } catch (e) {
      console.error("PTZ error", e);
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { setIsPlaying(true); setAutoplayBlocked(false); setIsLoading(false); };
    const onPause = () => setIsPlaying(false);
    const onPlaying = () => setIsLoading(false);
    const onWaiting = () => setIsLoading(true);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
    };
  }, []);
  
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        setAutoplayBlocked(true);
        setIsLoading(true);
      });
    }
  }, []);

  useEffect(() => {
    let hideTimer;
    const showControls = () => {
      setControlsVisible(true);
      clearTimeout(hideTimer);
      if (isPlaying) {
          hideTimer = setTimeout(() => setControlsVisible(false), 3000);
      }
    };
    const container = videoRef.current?.parentElement;
    if (!container) return;
    container.addEventListener("mousemove", showControls);
    container.addEventListener("mouseleave", () => clearTimeout(hideTimer));
    showControls();
    return () => {
      container.removeEventListener("mousemove", showControls);
      container.removeEventListener("mouseleave", () => clearTimeout(hideTimer));
      clearTimeout(hideTimer);
    };
  }, [isPlaying]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && hlsRef.current?.latency) {
        setLatency(hlsRef.current.latency.toFixed(1));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  /* Simple Zoom */
  const getClampedTransform = (newTransform) => {
    const { scale, x, y } = newTransform;
    const container = containerRef.current;
    if (!container) return newTransform;

    const containerRect = container.getBoundingClientRect();

    const maxX = Math.max(0, (containerRect.width * scale - containerRect.width) / 2);
    const maxY = Math.max(0, (containerRect.height * scale - containerRect.height) / 2);

    return {
      scale,
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const onPointerDown = useCallback((e) => {
    e.target.setPointerCapture(e.pointerId);
    gestureState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }, [gestureState]);

  const onPointerUp = useCallback((e) => {
    if (!gestureState.pointers.has(e.pointerId)) {
       return;
    }
    e.target.releasePointerCapture(e.pointerId);
    gestureState.pointers.delete(e.pointerId);
    if (gestureState.pointers.size < 2) {
      gestureState.lastDistance = 0;
    }
    if (gestureState.pointers.size < 1) {
      gestureState.lastMidpoint = null;
    }
  }, [gestureState]);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (transform.scale > 1) {
      container.style.touchAction = 'none';
    } else {
      container.style.touchAction = 'pan-y';
    }
    
  }, [transform.scale]);

  
  const onPointerMove = useCallback((e) => {
    if (gestureState.pointers.size === 0) return;

    // Обновляем указатель в карте
    gestureState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointers = Array.from(gestureState.pointers.values());

    if (pointers.length === 1) {
      if (!gestureState.lastMidpoint) {
        gestureState.lastMidpoint = { x: pointers[0].x, y: pointers[0].y };
        return;
      }
      
      const dx = pointers[0].x - gestureState.lastMidpoint.x;
      const dy = pointers[0].y - gestureState.lastMidpoint.y;
      gestureState.lastMidpoint = { x: pointers[0].x, y: pointers[0].y };
      
      if (transformRef.current.scale > 1) {
        setTransform(prev => {
          return getClampedTransform({ ...prev, x: prev.x + dx, y: prev.y + dy });
        });
      }

    } else if (pointers.length === 2) {
      const [p1, p2] = pointers;
      const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);

      if (gestureState.lastDistance > 0) {
        const scaleChange = distance / gestureState.lastDistance;
        setTransform(prev => {
          const newScale = Math.min(Math.max(1, prev.scale * scaleChange), 4);
          return getClampedTransform({ ...prev, scale: newScale });
        });
      }
      
      gestureState.lastDistance = distance;
    }
  }, [gestureState]);
  
  const onWheel = useCallback((e) => {
    const currentScale = transformRef.current.scale;
    const delta = e.deltaY * -0.005;
    
    const isZoomingOut = delta < 0;
    
    if (isZoomingOut && currentScale <= 1) {
      return;
    }
    
    e.preventDefault();
    
    setTransform(prev => {
      const newScale = Math.min(Math.max(1, prev.scale + delta), 4);
      const newTransform = { ...prev, scale: newScale };
      
      if (newScale === 1) {
        newTransform.x = 0;
        newTransform.y = 0;
      }
      return getClampedTransform(newTransform);
    });
  }, []);
  
  const onLostPointerCapture = useCallback((e) => {
      gestureState.pointers.delete(e.pointerId);
  }, [gestureState]);
  
  const windowedSizeRef = useRef({ width: 0, height: 0 });
  const fullscreenSizeRef = useRef({ width: 0, height: 0 });
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
        if (!document.fullscreenElement && entries[0]) {
            const { width, height } = entries[0].contentRect;
            windowedSizeRef.current = { width, height };
        }
    });

    resizeObserver.observe(container);

    if (container.clientWidth > 0 && !document.fullscreenElement) {
        windowedSizeRef.current = {
            width: container.clientWidth,
            height: container.clientHeight
        };
    }

    return () => resizeObserver.disconnect();
  }, [containerRef]);
  
  const onFullscreenChange = () => {
    const container = containerRef.current;
    if (!container) return;

    const isNowFullscreen = !!document.fullscreenElement;
    setIsFullscreen(isNowFullscreen);

    let oldSize, newSize;

    if (isNowFullscreen) {
        newSize = {
            width: container.clientWidth,
            height: container.clientHeight
        };
        fullscreenSizeRef.current = newSize;
        oldSize = windowedSizeRef.current;
    } else {
        newSize = {
            width: container.clientWidth,
            height: container.clientHeight
        };

        oldSize = fullscreenSizeRef.current;
    }

    if (oldSize.width === 0 || oldSize.height === 0 || newSize.width === 0) {
        console.warn("Размеры для пересчета трансформации еще не готовы.");
        return;
    }

    const changeX = newSize.width / oldSize.width;
    const changeY = newSize.height / oldSize.height;

    setTransform(prev => ({
        scale: prev.scale,
        x: prev.x * changeX,
        y: prev.y * changeY
    }));
  };
  
  useEffect(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerleave', onPointerUp);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('lostpointercapture', onLostPointerCapture);
    container.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointerleave', onPointerUp);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('lostpointercapture', onLostPointerCapture);
      container.removeEventListener('wheel', onWheel);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [onPointerDown, onPointerUp, onPointerMove, onWheel, onLostPointerCapture]);
  
  const videoStyles = {
    ...styles.videoElement,
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
  };

  return (
    <div ref={containerRef} style={styles.videoPlayerContainer}>
      <video ref={videoRef} muted={isMuted} playsInline style={videoStyles} />
      
      {(!ready || isLoading || autoplayBlocked) && (
        <div style={styles.videoOverlay}>
          {
            // 1 Готовность источника TODO перенести стили в styles
            !ready && latency === 0 ? (
              <><div style={{ fontSize: '16px', fontWeight: '1000', color: '#f66' }}>Неактивно</div>
              <a style={{ fontSize: '12px', color: 'white' }}>Этот источник недоступен!</a></>
            ) :
            // 2 Автопроигрывание (нужен клик на мобильных устройствах)
            autoplayBlocked ? (
            <button onClick={togglePlay} style={styles.videoPlayButton}>
              <PlayIcon />
            </button>
            )
            // 3 Загрузка
            : (
            <div style={styles.videoLoader} />
            )
          }
        </div>
      )}
      
      <div style={styles.videoLatency}>
        Задержка: {latency} сек
      </div>

      <div style={{...styles.videoControlsContainer, opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none' }}>
        <div style={styles.videoControlsGroup}>
          <button onClick={togglePlay} style={styles.videoControlButton}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={toggleMute} style={{ ...styles.videoControlButton, ...(!hasAudio ? { opacity: 0.5 } : {}) }}>
            {isMuted ? <VolumeXIcon /> : <Volume2Icon />}
          </button>
        </div>
        <button onClick={toggleFullscreen} style={styles.videoControlButton}>
          {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </button>
      </div>

      {ptzEndpoint && (!isMobile || isFullscreen) && (
        <div style={{ ...styles.videoPtzPanel, opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none' }}>
            <div style={{gridColumn: 2, gridRow: 1}}><button onClick={() => sendPTZ("up")} style={styles.videoControlButton}><ArrowUpIcon /></button></div>
            <div style={{gridColumn: 1, gridRow: 2}}><button onClick={() => sendPTZ("left")} style={styles.videoControlButton}><ArrowLeftIcon /></button></div>
            <div style={{gridColumn: 3, gridRow: 2}}><button onClick={() => sendPTZ("right")} style={styles.videoControlButton}><ArrowRightIcon /></button></div>
            <div style={{gridColumn: 2, gridRow: 3}}><button onClick={() => sendPTZ("down")} style={styles.videoControlButton}><ArrowDownIcon /></button></div>
        </div>
      )}
    </div>
  );
}

export default memo(VideoPlayer)

const PlayIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>;
const PauseIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>;
const Volume2Icon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>;
const VolumeXIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>;
const MaximizeIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>;
const MinimizeIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>;
const ArrowUpIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>;
const ArrowDownIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>;
const ArrowLeftIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const ArrowRightIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>;




