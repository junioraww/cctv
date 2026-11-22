import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Determines the best supported video MIME type and file extension.
 * If stream has no audio tracks, we strictly do NOT request audio codecs to prevent encoder stall.
 */
export function getSupportedVideoMimeType(hasAudio = false) {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: '', cleanMimeType: 'video/webm', extension: 'webm' };
  }

  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);

  const candidatesWithAudio = [
    { type: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', clean: 'video/mp4', ext: 'mp4' },
    { type: 'video/mp4;codecs=avc1', clean: 'video/mp4', ext: 'mp4' },
    { type: 'video/mp4', clean: 'video/mp4', ext: 'mp4' },
    { type: 'video/webm;codecs=vp9,opus', clean: 'video/webm', ext: 'webm' },
    { type: 'video/webm;codecs=vp8,opus', clean: 'video/webm', ext: 'webm' },
    { type: 'video/webm', clean: 'video/webm', ext: 'webm' },
  ];

  const candidatesVideoOnly = [
    { type: 'video/mp4;codecs=avc1', clean: 'video/mp4', ext: 'mp4' },
    { type: 'video/mp4', clean: 'video/mp4', ext: 'mp4' },
    { type: 'video/webm;codecs=vp9', clean: 'video/webm', ext: 'webm' },
    { type: 'video/webm;codecs=vp8', clean: 'video/webm', ext: 'webm' },
    { type: 'video/webm', clean: 'video/webm', ext: 'webm' },
  ];

  const candidates = hasAudio ? candidatesWithAudio : candidatesVideoOnly;

  const prioritized = isApple
    ? candidates
    : [...candidates.filter(c => c.ext === 'webm'), ...candidates.filter(c => c.ext === 'mp4')];

  for (const item of prioritized) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(item.type)) {
      return { mimeType: item.type, cleanMimeType: item.clean, extension: item.ext };
    }
  }

  return { mimeType: '', cleanMimeType: 'video/webm', extension: 'webm' };
}

export function formatDuration(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

// Limits for memory safety
const MAX_RECORDING_SECONDS = 1800; // 30 minutes
const MAX_RECORDING_BYTES = 400 * 1024 * 1024; // 400 MB RAM threshold
const MIN_STORAGE_FREE_BYTES = 80 * 1024 * 1024; // 80 MB storage safety margin

export function useVideoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [notice, setNotice] = useState(null);

  const mediaRecorderRef = useRef(null);
  const recordedStreamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const quotaIntervalRef = useRef(null);
  const totalBytesRef = useRef(0);
  const cameraNameRef = useRef('camera');
  const mimeInfoRef = useRef({ mimeType: '', cleanMimeType: 'video/webm', extension: 'webm' });
  const noticeTimerRef = useRef(null);
  const isStoppingRef = useRef(false);

  const showNotice = useCallback((text, durationMs = 3500) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(text);
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, durationMs);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (quotaIntervalRef.current) {
      clearInterval(quotaIntervalRef.current);
      quotaIntervalRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    if (recordedStreamRef.current) {
      try {
        recordedStreamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn('[Recorder] Error stopping tracks:', e);
      }
      recordedStreamRef.current = null;
    }
  }, []);

  const cleanupMemory = useCallback(() => {
    recordedChunksRef.current = [];
    totalBytesRef.current = 0;
    releaseStream();
    mediaRecorderRef.current = null;
    isStoppingRef.current = false;
    setIsRecording(false);
    setIsSaving(false);
  }, [releaseStream]);

  /**
   * Stops the MediaRecorder, flushes buffers, and returns the final Blob.
   */
  const finalizeRecorderBlob = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const mime = mimeInfoRef.current.mimeType || 'video/webm';

      if (!recorder || recorder.state === 'inactive') {
        const chunks = recordedChunksRef.current;
        if (chunks && chunks.length > 0) {
          resolve(new Blob(chunks, { type: mime }));
        } else {
          resolve(null);
        }
        return;
      }

      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        if (chunks && chunks.length > 0) {
          resolve(new Blob(chunks, { type: mime }));
        } else {
          resolve(null);
        }
      };

      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
      } catch (e) {
        console.warn('[Recorder] requestData failed:', e);
      }

      try {
        recorder.stop();
      } catch (e) {
        console.warn('[Recorder] recorder.stop failed:', e);
        const chunks = recordedChunksRef.current;
        resolve(chunks && chunks.length > 0 ? new Blob(chunks, { type: mime }) : null);
      }
    });
  }, []);

  /**
   * Handles saving a blob to disk.
   */
  const saveBlob = useCallback(async (blob, isUserGesture = false) => {
    if (!blob || blob.size === 0) {
      showNotice('Запись пуста или была прервана');
      cleanupMemory();
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const safeName = (cameraNameRef.current || 'camera').replace(/[/\\?%*:|"<>]/g, '_').trim();
    const ext = mimeInfoRef.current.extension || 'webm';
    const cleanMime = mimeInfoRef.current.cleanMimeType || 'video/' + ext;
    const defaultFileName = `Запись_${safeName}_${dateStr}_${timeStr}.${ext}`;

    setIsSaving(true);

    try {
      // 1. Try Desktop File System Access API (native "Save As..." dialog)
      if (isUserGesture && typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
        let fileHandle = null;
        try {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: defaultFileName,
            types: [
              {
                description: 'Видеозапись камеры',
                accept: { [cleanMime]: ['.' + ext] },
              },
            ],
          });
        } catch (pickerErr) {
          if (pickerErr && pickerErr.name === 'AbortError') {
            showNotice('Сохранение отменено');
            cleanupMemory();
            return;
          }
          console.warn('[Recorder] showSaveFilePicker failed, trying download fallback:', pickerErr);
        }

        if (fileHandle) {
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          showNotice('Запись успешно сохранена!');
          cleanupMemory();
          return;
        }
      }

      // 2. Fallback: browser download (Safari, Firefox, Mobile, or non-gesture auto-stop)
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = defaultFileName;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        try {
          if (a.parentNode) document.body.removeChild(a);
        } catch (e) {}
        URL.revokeObjectURL(blobUrl);
      }, 10000);

      showNotice('Запись отправлена на скачивание');
    } catch (err) {
      console.error('[Recorder] Error saving recording:', err);
      showNotice('Ошибка при сохранении видео');
    } finally {
      cleanupMemory();
    }
  }, [showNotice, cleanupMemory]);

  /**
   * Stop recording.
   * If invoked directly by user click, `isUserGesture` is true, enabling the native "Save As" picker.
   */
  const stopRecording = useCallback(async (reason = null, isUserGesture = true) => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    clearTimers();
    setIsRecording(false);
    setIsSaving(true);

    if (reason) {
      showNotice(reason);
    }

    const ext = mimeInfoRef.current.extension || 'webm';
    const cleanMime = mimeInfoRef.current.cleanMimeType || 'video/' + ext;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const safeName = (cameraNameRef.current || 'camera').replace(/[/\\?%*:|"<>]/g, '_').trim();
    const defaultFileName = `Запись_${safeName}_${dateStr}_${timeStr}.${ext}`;

    // 1. If triggered by user click on supported browser, open showSaveFilePicker IMMEDIATELY
    // to preserve the transient user activation token before any async delay!
    let fileHandle = null;
    let pickerCancelled = false;

    if (isUserGesture && typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      // Start stopping recorder in background while user interacts with picker
      const blobPromise = finalizeRecorderBlob();

      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [
            {
              description: 'Видеозапись камеры',
              accept: { [cleanMime]: ['.' + ext] },
            },
          ],
        });
      } catch (pickerErr) {
        if (pickerErr && pickerErr.name === 'AbortError') {
          pickerCancelled = true;
        } else {
          console.warn('[Recorder] showSaveFilePicker error, will fallback:', pickerErr);
        }
      }

      if (pickerCancelled) {
        showNotice('Сохранение отменено');
        await blobPromise;
        cleanupMemory();
        return;
      }

      const blob = await blobPromise;

      if (!blob || blob.size === 0) {
        showNotice('Запись пуста (слишком короткая)');
        cleanupMemory();
        return;
      }

      if (fileHandle) {
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          showNotice('Запись успешно сохранена!');
        } catch (writeErr) {
          console.error('[Recorder] Error writing to file handle:', writeErr);
          showNotice('Ошибка записи файла');
        } finally {
          cleanupMemory();
        }
        return;
      }

      // If picker threw non-abort error, fall through to fallback
      await saveBlob(blob, false);
      return;
    }

    // 2. Fallback path (Safari, Firefox, Mobile, or Auto-stop)
    const blob = await finalizeRecorderBlob();
    await saveBlob(blob, isUserGesture);
  }, [clearTimers, showNotice, finalizeRecorderBlob, saveBlob, cleanupMemory]);

  /**
   * Start recording.
   */
  const startRecording = useCallback((videoElement, camName) => {
    if (!videoElement) {
      showNotice('Видеоэлемент не найден');
      return false;
    }

    if (typeof MediaRecorder === 'undefined') {
      showNotice('MediaRecorder не поддерживается в данном браузере');
      return false;
    }

    if (videoElement.readyState < 2) {
      showNotice('Поток еще не готов. Дождитесь загрузки видео');
      return false;
    }

    try {
      // 1. Capture stream
      let stream = null;
      if (typeof videoElement.captureStream === 'function') {
        stream = videoElement.captureStream();
      } else if (typeof videoElement.mozCaptureStream === 'function') {
        stream = videoElement.mozCaptureStream();
      }

      if (!stream || stream.getVideoTracks().length === 0) {
        showNotice('Не удалось захватить видеопоток');
        return false;
      }

      recordedStreamRef.current = stream;
      recordedChunksRef.current = [];
      totalBytesRef.current = 0;
      cameraNameRef.current = camName || 'camera';
      isStoppingRef.current = false;

      // 2. Check if stream has audio tracks
      const hasAudio = stream.getAudioTracks().length > 0;
      const mimeInfo = getSupportedVideoMimeType(hasAudio);
      mimeInfoRef.current = mimeInfo;

      const options = mimeInfo.mimeType ? { mimeType: mimeInfo.mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      // 3. Setup data handler
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          totalBytesRef.current += e.data.size;

          // RAM threshold safety check (400 MB)
          if (totalBytesRef.current >= MAX_RECORDING_BYTES) {
            stopRecording('Лимит памяти записи (400 МБ) достигнут', false);
          }
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error('[Recorder] MediaRecorder error:', e);
        stopRecording('Произошла ошибка при записи видео', false);
      };

      // 4. Start recording with 1-second timeslice chunks
      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsSaving(false);
      setRecordingDuration(0);

      // 5. Start duration timer
      let duration = 0;
      timerIntervalRef.current = setInterval(() => {
        duration += 1;
        setRecordingDuration(duration);

        if (duration >= MAX_RECORDING_SECONDS) {
          stopRecording('Достигнута максимальная длительность записи (30 мин)', false);
        }
      }, 1000);

      // 6. Storage quota monitoring (checks every 4 seconds)
      quotaIntervalRef.current = setInterval(async () => {
        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
          try {
            const { quota, usage } = await navigator.storage.estimate();
            if (quota && usage !== undefined) {
              const free = quota - usage;
              if (free < MIN_STORAGE_FREE_BYTES) {
                stopRecording('Заканчивается свободное место в хранилище', false);
              }
            }
          } catch (e) {}
        }
      }, 4000);

      return true;
    } catch (err) {
      console.error('[Recorder] Failed to start recording:', err);
      showNotice('Ошибка запуска записи: ' + (err.message || err));
      cleanupMemory();
      return false;
    }
  }, [showNotice, stopRecording, cleanupMemory]);

  // Window beforeunload warning while recording
  useEffect(() => {
    if (!isRecording) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Идет запись видеокамеры. Если вы покинете страницу, запись будет прервана.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRecording]);

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      clearTimers();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      cleanupMemory();
    };
  }, [clearTimers, cleanupMemory]);

  return {
    isRecording,
    isSaving,
    recordingDuration,
    notice,
    startRecording,
    stopRecording,
  };
}
