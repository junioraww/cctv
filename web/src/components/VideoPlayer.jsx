import { useEffect, useRef, useState, useCallback, memo } from "react"
import styles from '../styles'
import { useVideoRecorder, formatDuration } from '../hooks/useVideoRecorder'

const VideoPlayer = ({ api, ready, groupId, token, url, ptzEndpoint, isMobile, cameraName }) => {
  const hlsRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  /* re-rendering fix */
  const tokenRef = useRef(token);

  const {
    isRecording,
    isSaving,
    recordingDuration,
    notice,
    startRecording,
    stopRecording,
  } = useVideoRecorder();

  const handleToggleRecord = useCallback(async (e) => {
    e?.stopPropagation();
    if (isSaving) return;
    if (isRecording) {
      await stopRecording(null, true);
    } else {
      startRecording(videoRef.current, cameraName || `Camera_${groupId}`);
    }
  }, [isRecording, isSaving, stopRecording, startRecording, cameraName, groupId]);

  const [ isPlaying, setIsPlaying ] = useState(false);
  const [ hasAudio, setHasAudio ] = useState(false);
  const [ isMuted, setIsMuted ] = useState(true);
  const [ isFullscreen, setIsFullscreen ] = useState(false);
  const [ isPseudoFullscreen, setIsPseudoFullscreen ] = useState(false);
  const [ containerSize, setContainerSize ] = useState({ width: 0, height: 0 });
  const [ objectFitMode, setObjectFitMode ] = useState('contain'); // 'contain' | 'cover'
  const [ manualRotateAngle, setManualRotateAngle ] = useState(null); // null = auto, 0 = 0deg, -90 = -90deg

  const isFullscreenActive = isFullscreen || isPseudoFullscreen;
  const isLandscape = containerSize.width >= containerSize.height;
  const isMobileDevice = isMobile || (typeof window !== 'undefined' && (window.innerWidth < 1024 || 'ontouchstart' in window));
  const shouldAutoRotate = isFullscreenActive && isMobileDevice && !isLandscape;
  const isRotated = isFullscreenActive && (manualRotateAngle !== null ? manualRotateAngle === -90 : shouldAutoRotate);

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
    lastPinchMidpoint: null,
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
      hls.on(Hls.Events.ERROR, (eventName, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[HLS] Network error, attempting recovery...', data);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[HLS] Media error, attempting recovery...', data);
              hls.recoverMediaError();
              break;
            default:
              console.error('[HLS] Unrecoverable error:', data);
              break;
          }
        }
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
    const container = containerRef.current;
    if (!container) return;
    const isCurrentlyFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || isPseudoFullscreen);

    if (!isCurrentlyFullscreen) {
      let enteredNative = false;
      try {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
          enteredNative = true;
        } else if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
          enteredNative = true;
        }
      } catch (err) {
        console.warn('Native fullscreen rejected, using pseudo-fullscreen', err);
      }

      if (!enteredNative && !document.fullscreenElement) {
        setIsPseudoFullscreen(true);
      }

      try {
        if (window.screen?.orientation?.lock) {
          await window.screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (e) {}
    } else {
      setIsPseudoFullscreen(false);
      try {
        if (window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
      } catch (e) {}

      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        }
      } catch (err) {
        console.warn('Exit fullscreen error', err);
      }
      setManualRotateAngle(null);
      setTransform({ scale: 1, x: 0, y: 0 });
    }
  };

  const toggleRotate = (e) => {
    e?.stopPropagation();
    if (manualRotateAngle === null) {
      setManualRotateAngle(shouldAutoRotate ? 0 : -90);
    } else {
      setManualRotateAngle(prev => prev === -90 ? 0 : -90);
    }
  };

  const toggleFitMode = (e) => {
    e?.stopPropagation();
    setObjectFitMode(prev => prev === 'cover' ? 'contain' : 'cover');
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
  
  /* Simple Zoom & Boundary Page Scroll */
  const getScrollParent = (node) => {
    if (!node) return null;
    let parent = node.parentElement;
    while (parent && parent !== document.body) {
      const { overflowY } = window.getComputedStyle(parent);
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return document.scrollingElement || document.documentElement || document.body;
  };

  const getClampedTransform = useCallback((newTransform) => {
    const { scale, x, y } = newTransform;
    const container = containerRef.current;
    if (!container) return newTransform;

    const baseW = isRotated ? (containerSize.height || (typeof window !== 'undefined' ? window.innerHeight : 640)) : (containerSize.width || container.clientWidth);
    const baseH = isRotated ? (containerSize.width || (typeof window !== 'undefined' ? window.innerWidth : 360)) : (containerSize.height || container.clientHeight);

    const maxX = Math.max(0, (baseW * scale - baseW) / 2);
    const maxY = Math.max(0, (baseH * scale - baseH) / 2);

    return {
      scale,
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, [isRotated, containerSize]);

  const onPointerDown = useCallback((e) => {
    if (e.target.closest('button, a, input')) return;

    gestureState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (transformRef.current.scale > 1 || gestureState.pointers.size > 1) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (err) {}
      e.stopPropagation();
    }

    if (gestureState.pointers.size === 2) {
      const pts = Array.from(gestureState.pointers.values());
      gestureState.lastDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gestureState.lastPinchMidpoint = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
    }
  }, [gestureState]);

  const onPointerUp = useCallback((e) => {
    if (!gestureState.pointers.has(e.pointerId)) {
       return;
    }
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (err) {}
    gestureState.pointers.delete(e.pointerId);
    if (gestureState.pointers.size < 2) {
      gestureState.lastDistance = 0;
      gestureState.lastPinchMidpoint = null;
      if (gestureState.pointers.size === 1) {
        const remaining = gestureState.pointers.values().next().value;
        if (remaining) {
          gestureState.lastMidpoint = { x: remaining.x, y: remaining.y };
        }
      }
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
      container.style.touchAction = 'pan-x pan-y';
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
      
      const currentScale = transformRef.current.scale;
      const container = containerRef.current;

      const effectiveDx = isRotated ? -dy : dx;
      const effectiveDy = isRotated ? dx : dy;

      if (currentScale > 1) {
        if (!container) return;
        const baseW = isRotated ? (containerSize.height || (typeof window !== 'undefined' ? window.innerHeight : 640)) : (containerSize.width || container.clientWidth);
        const baseH = isRotated ? (containerSize.width || (typeof window !== 'undefined' ? window.innerWidth : 360)) : (containerSize.height || container.clientHeight);

        const maxX = Math.max(0, (baseW * currentScale - baseW) / 2);
        const maxY = Math.max(0, (baseH * currentScale - baseH) / 2);

        const currentX = transformRef.current.x;
        const currentY = transformRef.current.y;

        // 1. Horizontal pan within camera bounds
        const targetX = currentX + effectiveDx;
        const clampedX = Math.max(-maxX, Math.min(maxX, targetX));

        // 2. Vertical pan: if camera hits edge, scroll the parent page!
        const targetY = currentY + effectiveDy;
        const clampedY = Math.max(-maxY, Math.min(maxY, targetY));
        const overflowY = targetY - clampedY;

        setTransform(prev => ({
          ...prev,
          x: clampedX,
          y: clampedY
        }));

        // Handover to page scroll if at boundary and outside fullscreen
        if (!isFullscreenActive) {
          if (overflowY !== 0) {
            const scrollParent = getScrollParent(container);
            if (scrollParent) {
              scrollParent.scrollTop -= overflowY;
            }
          } else if (clampedY === currentY && Math.abs(dy) > 0) {
            const scrollParent = getScrollParent(container);
            if (scrollParent) {
              scrollParent.scrollTop -= dy;
            }
          }
        }
      } else if (!isFullscreenActive && e.pointerType === 'touch') {
        // scale === 1 on mobile touch: 1 finger scrolls the page!
        const scrollParent = getScrollParent(container);
        if (scrollParent && Math.abs(dy) > 0) {
          scrollParent.scrollTop -= dy;
        }
      }

    } else if (pointers.length === 2) {
      const [p1, p2] = pointers;
      const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const currentMid = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };

      if (gestureState.lastDistance > 10 && distance > 10 && gestureState.lastPinchMidpoint) {
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();

        if (rect) {
          const scaleChange = distance / gestureState.lastDistance;

          // Координаты центра контейнера в окне
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          const prevRelX = gestureState.lastPinchMidpoint.x - centerX;
          const prevRelY = gestureState.lastPinchMidpoint.y - centerY;
          const currRelX = currentMid.x - centerX;
          const currRelY = currentMid.y - centerY;

          // При повороте на -90° (против часовой):
          // screen right (+X) это local +Y
          // screen down (+Y) это local -X
          const prevLocalX = isRotated ? -prevRelY : prevRelX;
          const prevLocalY = isRotated ? prevRelX : prevRelY;
          const currLocalX = isRotated ? -currRelY : currRelX;
          const currLocalY = isRotated ? currRelX : currRelY;

          setTransform(prev => {
            const oldScale = prev.scale;
            const newScale = Math.min(Math.max(1, oldScale * scaleChange), 4);

            if (newScale === 1) {
              return { scale: 1, x: 0, y: 0 };
            }

            const ratio = newScale / oldScale;

            // Формула приближения к фокальной точке (focal point):
            // Держит точку под пальцами ровно на том же месте экрана
            const targetX = currLocalX - ratio * (prevLocalX - prev.x);
            const targetY = currLocalY - ratio * (prevLocalY - prev.y);

            return getClampedTransform({
              scale: newScale,
              x: targetX,
              y: targetY
            });
          });
        }
      }

      gestureState.lastDistance = distance;
      gestureState.lastPinchMidpoint = currentMid;
    }
  }, [gestureState, isRotated, containerSize, isFullscreenActive, getClampedTransform]);
  
  const onWheel = useCallback((e) => {
    const currentScale = transformRef.current.scale;
    const isFullscreenActive = !!document.fullscreenElement;
    const delta = e.deltaY * -0.005;
    const isZoomingOut = delta < 0; // deltaY > 0 (wheel down)
    const isZoomingIn = delta > 0;  // deltaY < 0 (wheel up)

    // 1. Outside fullscreen boundary handling:
    if (!isFullscreenActive) {
      if (isZoomingOut && currentScale <= 1) {
        const scrollParent = getScrollParent(containerRef.current);
        if (scrollParent) scrollParent.scrollTop += e.deltaY;
        return;
      }
      if (isZoomingIn && currentScale >= 4) {
        const scrollParent = getScrollParent(containerRef.current);
        if (scrollParent) scrollParent.scrollTop += e.deltaY;
        return;
      }
    }

    // 2. Focal point zoom towards mouse cursor position:
    e.preventDefault();
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();

    if (rect) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const relX = e.clientX - centerX;
      const relY = e.clientY - centerY;
      const localX = isRotated ? -relY : relX;
      const localY = isRotated ? relX : relY;

      setTransform(prev => {
        const oldScale = prev.scale;
        const newScale = Math.min(Math.max(1, oldScale + delta), 4);
        if (newScale === 1) {
          return { scale: 1, x: 0, y: 0 };
        }
        const ratio = newScale / oldScale;
        const targetX = localX - ratio * (localX - prev.x);
        const targetY = localY - ratio * (localY - prev.y);

        return getClampedTransform({
          scale: newScale,
          x: targetX,
          y: targetY
        });
      });
    }
  }, [isRotated, getClampedTransform]);

  const onDoubleClick = useCallback((e) => {
    if (e.target.closest('button, a, input')) return;
    if (isFullscreenActive && isMobileDevice) {
      setObjectFitMode(prev => prev === 'cover' ? 'contain' : 'cover');
    } else {
      setTransform(prev => {
        if (prev.scale > 1) {
          return { scale: 1, x: 0, y: 0 };
        } else {
          return { scale: 2, x: 0, y: 0 };
        }
      });
    }
  }, [isFullscreenActive, isMobileDevice]);
  
  const onLostPointerCapture = useCallback((e) => {
      gestureState.pointers.delete(e.pointerId);
  }, [gestureState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const w = container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
      const h = container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
      setContainerSize({ width: w, height: h });
    };

    updateSize();

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateSize());
      ro.observe(container);
    }

    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', updateSize);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
    };
  }, []);

  const onFullscreenChange = useCallback(() => {
    const isNowFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    setIsFullscreen(isNowFullscreen);
    if (!isNowFullscreen && !isPseudoFullscreen) {
      if (window.screen?.orientation?.unlock) {
        try { window.screen.orientation.unlock(); } catch (e) {}
      }
      setManualRotateAngle(null);
    }
    setTransform({ scale: 1, x: 0, y: 0 });
  }, [isPseudoFullscreen]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, [onFullscreenChange]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
        setManualRotateAngle(null);
        setTransform({ scale: 1, x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPseudoFullscreen]);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerleave', onPointerUp);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('lostpointercapture', onLostPointerCapture);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('dblclick', onDoubleClick);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointerleave', onPointerUp);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('lostpointercapture', onLostPointerCapture);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('dblclick', onDoubleClick);
    };
  }, [onPointerDown, onPointerUp, onPointerMove, onWheel, onLostPointerCapture, onDoubleClick]);
  
  const curW = containerSize.width || (typeof window !== 'undefined' ? window.innerWidth : 360);
  const curH = containerSize.height || (typeof window !== 'undefined' ? window.innerHeight : 640);

  const containerStyle = {
    ...styles.videoPlayerContainer,
    ...(isPseudoFullscreen ? {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 99999,
      borderRadius: 0,
      margin: 0,
    } : {}),
  };

  const wrapperStyle = isRotated
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${curH}px`,
        height: `${curW}px`,
        transform: 'translate(-50%, -50%) rotate(-90deg)',
        transformOrigin: 'center center',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        transition: 'transform 0.2s ease, width 0.2s ease, height 0.2s ease',
      }
    : {
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        transition: 'transform 0.2s ease',
      };

  const videoStyles = {
    ...styles.videoElement,
    objectFit: objectFitMode,
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      <div style={wrapperStyle}>
        <video ref={videoRef} muted={isMuted} playsInline crossOrigin="anonymous" style={videoStyles} />
        
        {(!ready || isLoading || autoplayBlocked) && (
          <div style={styles.videoOverlay}>
            {
              !ready && latency === 0 ? (
                <><div style={{ fontSize: '16px', fontWeight: '1000', color: '#f66' }}>Неактивно</div>
                <a style={{ fontSize: '12px', color: 'white' }}>Этот источник недоступен!</a></>
              ) :
              autoplayBlocked ? (
                <button onClick={togglePlay} style={styles.videoPlayButton}>
                  <PlayIcon />
                </button>
              ) : (
                <div style={styles.videoLoader} />
              )
            }
          </div>
        )}
        
        <div style={styles.videoTopBadges}>
          <div style={styles.videoLatencyBadge}>
            Задержка: {latency} сек
          </div>
          {isRecording && (
            <button
              type="button"
              onClick={handleToggleRecord}
              style={styles.recordingBadge}
              title="Нажмите, чтобы остановить и сохранить запись"
            >
              <span style={styles.recordingDot} />
              <span>REC {formatDuration(recordingDuration)}</span>
            </button>
          )}
        </div>

        {notice && (
          <div style={styles.videoNoticeToast}>
            {notice}
          </div>
        )}

        {transform.scale > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setTransform({ scale: 1, x: 0, y: 0 }); }}
            style={styles.zoomResetBadge}
            title="Сбросить масштаб"
          >
            {transform.scale.toFixed(1)}x ✕
          </button>
        )}

        <div style={{...styles.videoControlsContainer, opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none' }}>
          <div style={styles.videoControlsGroup}>
            <button onClick={togglePlay} style={styles.videoControlButton} title={isPlaying ? "Пауза" : "Воспроизведение"}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={toggleMute} style={{ ...styles.videoControlButton, ...(!hasAudio ? { opacity: 0.5 } : {}) }} title={isMuted ? "Включить звук" : "Выключить звук"}>
              {isMuted ? <VolumeXIcon /> : <Volume2Icon />}
            </button>
            <button
              type="button"
              onClick={handleToggleRecord}
              disabled={isSaving}
              style={{
                ...styles.videoControlButton,
                opacity: isRecording ? 1 : 0.45,
                ...(isRecording ? { color: '#f56565' } : {}),
                ...(isSaving ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
              }}
              title={isSaving ? "Сохранение записи..." : (isRecording ? "Остановить запись" : "Начать запись камеры")}
            >
              <RecordIcon isRecording={isRecording} isSaving={isSaving} />
            </button>
          </div>
          <div style={styles.videoControlsGroup}>
            {isFullscreenActive && isMobileDevice && (
              <button
                type="button"
                onClick={toggleFitMode}
                style={{ ...styles.videoControlButton, ...(objectFitMode === 'cover' ? { color: '#63b3ed' } : {}) }}
                title={objectFitMode === 'cover' ? "По размеру кадра" : "Заполнить экран"}
              >
                {objectFitMode === 'cover' ? <FitScreenIcon /> : <FillScreenIcon />}
              </button>
            )}
            {isFullscreenActive && isMobileDevice && (
              <button
                type="button"
                onClick={toggleRotate}
                style={{ ...styles.videoControlButton, ...(isRotated ? { color: '#63b3ed' } : {}) }}
                title={isRotated ? "Повернуть горизонтально" : "Повернуть вертикально"}
              >
                <ScreenRotateIcon />
              </button>
            )}
            <button onClick={toggleFullscreen} style={styles.videoControlButton} title={isFullscreenActive ? "Свернуть" : "Полный экран"}>
              {isFullscreenActive ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
          </div>
        </div>

        {ptzEndpoint && (!isMobile || isFullscreenActive) && (
          <div style={{ ...styles.videoPtzPanel, opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none' }}>
              <div style={{gridColumn: 2, gridRow: 1}}><button onClick={() => sendPTZ("up")} style={styles.videoControlButton}><ArrowUpIcon /></button></div>
              <div style={{gridColumn: 1, gridRow: 2}}><button onClick={() => sendPTZ("left")} style={styles.videoControlButton}><ArrowLeftIcon /></button></div>
              <div style={{gridColumn: 3, gridRow: 2}}><button onClick={() => sendPTZ("right")} style={styles.videoControlButton}><ArrowRightIcon /></button></div>
              <div style={{gridColumn: 2, gridRow: 3}}><button onClick={() => sendPTZ("down")} style={styles.videoControlButton}><ArrowDownIcon /></button></div>
          </div>
        )}
      </div>
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

const ScreenRotateIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21.5 2v6h-6"></path>
    <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
  </svg>
);

const FillScreenIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="15 3 21 3 21 9"></polyline>
    <polyline points="9 21 3 21 3 15"></polyline>
    <line x1="21" y1="3" x2="14" y2="10"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  </svg>
);

const FitScreenIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="4 14 10 14 10 20"></polyline>
    <polyline points="20 10 14 10 14 4"></polyline>
    <line x1="14" y1="10" x2="21" y2="3"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  </svg>
);

const RecordIcon = ({ isRecording, isSaving }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {isRecording ? (
      <rect x="6" y="6" width="12" height="12" rx="2" fill="#f56565" stroke="#f56565" />
    ) : (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" fill={isSaving ? "#ecc94b" : "currentColor"} stroke={isSaving ? "#ecc94b" : "currentColor"} />
      </>
    )}
  </svg>
);




