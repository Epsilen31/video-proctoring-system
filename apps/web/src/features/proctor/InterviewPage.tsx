import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMediaRecorder, type RecordingResult } from '../../hooks/useMediaRecorder';
import { useUserMedia } from '../../hooks/useUserMedia';
import {
  appendEvents as apiAppendEvents,
  createSession as apiCreateSession,
  endSession as apiEndSession,
  uploadVideo as apiUploadVideo,
} from '../../lib/api';
import { appEnv } from '../../lib/env';
import { loadRecording, saveRecording } from '../../lib/storage';
import { useObjectWorker } from '../../ml/objects/useObjectWorker';
import { useFocusWorker } from '../../ml/face/useFocusWorker';
import { useSessionStore } from '../../store/session';
import { CameraStage } from './components/CameraStage';
import { ControlsPanel } from './components/ControlsPanel';
import { EventFeed } from './components/EventFeed';

const InterviewPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureInFlightRef = useRef(false);

  const {
    sessionId,
    status,
    focusState,
    fps,
    avgFps,
    events,
    videoRef: sessionVideo,
  } = useSessionStore((state) => ({
    sessionId: state.sessionId,
    status: state.status,
    focusState: state.focusState,
    fps: state.fps,
    avgFps: state.avgFps,
    events: state.events,
    videoRef: state.videoRef,
  }));

  const beginSession = useSessionStore((state) => state.beginSession);
  const beginSessionWithId = useSessionStore((state) => state.beginSessionWithId);
  const endSession = useSessionStore((state) => state.endSession);
  const resetSession = useSessionStore((state) => state.resetSession);
  const updateFps = useSessionStore((state) => state.updateFps);
  const setVideoRef = useSessionStore((state) => state.setVideoRef);
  const logEvent = useSessionStore((state) => state.logEvent);
  const drainEvents = useSessionStore((state) => state.drainEvents);
  const setFocusState = useSessionStore((state) => state.setFocusState);

  const {
    stream,
    isRequesting,
    error: streamError,
    start: requestStream,
    stop: stopStream,
  } = useUserMedia();
  const {
    start: startRecorder,
    stop: stopRecorder,
    error: recorderError,
    reset: resetRecorder,
  } = useMediaRecorder();

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [recordingBytes, setRecordingBytes] = useState<number | undefined>(undefined);
  const [internalErrors, setInternalErrors] = useState<string[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  // Defer ML worker initialization until the session starts and page is visible
  const [workersEnabled, setWorkersEnabled] = useState(false);

  const isRunning = status === 'running';
  const isSessionActive = Boolean(stream) && isRunning;

  const pushError = useCallback((message: string) => {
    setInternalErrors((prev) => {
      if (prev.includes(message)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  // Pause ML when tab hidden
  useEffect(() => {
    const onVis = () => {
      setWorkersEnabled((prev) => (!document.hidden ? prev || isRunning : false));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isRunning]);

  // Keep latest detections/face box for overlay
  const lastDetectionsRef = useRef<
    {
      className: string;
      score: number;
      bbox: { x: number; y: number; width: number; height: number };
    }[]
  >([]);
  const lastFaceBoxRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    yaw: number | null;
    pitch: number | null;
    ratio: number;
  } | null>(null);

  const {
    ready: isObjectWorkerReady,
    sendBitmap: sendObjectBitmap,
    reset: resetObjectWorker,
  } = useObjectWorker({
    videoRef,
    onError: pushError,
    onDetections: (_ts, detections) => {
      lastDetectionsRef.current = detections;
    },
    enabled: workersEnabled && (appEnv.objectEnabled ?? true),
  });

  const { ready: isFocusWorkerReady, sendBitmap: sendFocusBitmap, reset: resetFocusWorker } =
    useFocusWorker({
      onError: pushError,
      onState: (payload) => {
        setFocusState(payload.focusState);
        if (payload.bbox) {
          lastFaceBoxRef.current = {
            minX: payload.bbox.minX,
            minY: payload.bbox.minY,
            maxX: payload.bbox.maxX,
            maxY: payload.bbox.maxY,
            yaw: payload.yaw,
            pitch: payload.pitch,
            ratio: payload.ratio,
          };
        } else {
          lastFaceBoxRef.current = null;
        }
      },
      enabled: workersEnabled,
    });

  const isUiReady = isWorkerReady && isObjectWorkerReady && isFocusWorkerReady;
  const isLoading = isStarting || isRequesting;

  const aggregatedErrors = useMemo(() => {
    const collection = new Set<string>();
    internalErrors.forEach((err) => collection.add(err));
    if (streamError) collection.add(streamError);
    if (recorderError) collection.add(recorderError);
    return Array.from(collection);
  }, [internalErrors, recorderError, streamError]);

  const syncCanvasDimensions = useCallback(() => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      return;
    }
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
  }, []);

  const attachStreamToVideo = useCallback(
    async (mediaStream: MediaStream) => {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      (videoEl).srcObject = mediaStream;
      try {
        await videoEl.play();
      } catch {}
      if (videoEl.readyState >= 2) {
        syncCanvasDimensions();
      } else {
        videoEl.onloadedmetadata = () => syncCanvasDimensions();
      }
    },
    [syncCanvasDimensions],
  );

  const cleanupVideoElement = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.pause();
    (videoEl).srcObject = null;
  }, []);

  const clearDownloadUrl = useCallback(() => {
    setDownloadUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  const persistRecording = useCallback(
    async (recording: RecordingResult) => {
      await saveRecording(recording);
      const url = URL.createObjectURL(recording.blob);
      setDownloadUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setRecordingBytes(recording.bytes);
      setVideoRef({ url, bytes: recording.bytes });
    },
    [setVideoRef],
  );

  // Mark focus ready when enabled
  useEffect(() => {
    setIsWorkerReady(workersEnabled);
  }, [workersEnabled]);

  // Frame pump with decimation and downscale: send frames to both workers
  useEffect(() => {
    if (!isSessionActive || !isWorkerReady || !workersEnabled) return;
    if (typeof createImageBitmap !== 'function') {
      pushError('createImageBitmap is not supported in this browser.');
      return;
    }
    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;
    const minDelta = 1000 / Math.max(1, Math.min(appEnv.detectionFps, 8));
    let lastCapture = 0;
    let rafId = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      if (
        'requestVideoFrameCallback' in videoEl &&
        typeof (videoEl as any).requestVideoFrameCallback === 'function'
      ) {
        (videoEl as any).requestVideoFrameCallback((now: number) => onFrame(now));
      } else {
        rafId = requestAnimationFrame(() => onFrame(performance.now()));
      }
    };

    const onFrame = (now: number) => {
      if (cancelled) return;
      if (now - lastCapture < minDelta || captureInFlightRef.current) return scheduleNext();
      if (videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight)
        return scheduleNext();
      captureInFlightRef.current = true;
      lastCapture = now;

      // Downscale capture for lower CPU
      const maxSide = 360;
      const vw = videoEl.videoWidth || maxSide;
      const vh = videoEl.videoHeight || maxSide;
      const scale = Math.min(1, maxSide / Math.max(vw, vh));
      const resizeWidth = Math.max(1, Math.round(vw * scale));
      const resizeHeight = Math.max(1, Math.round(vh * scale));
      const opts: ImageBitmapOptions = {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
        resizeWidth,
        resizeHeight,
        resizeQuality: 'low',
      } as any;

      createImageBitmap(videoEl, opts)
        .then((bitmap) => {
          // Post to object worker and then a cloned bitmap to focus worker
          try {
            sendObjectBitmap(bitmap, now);
            return createImageBitmap(bitmap).then((clone) => {
              bitmap.close();
              sendFocusBitmap(clone, now);
            });
          } catch (e) {
            bitmap.close();
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to capture frame';
          pushError(message);
        })
        .finally(() => {
          captureInFlightRef.current = false;
          scheduleNext();
        });
    };

    scheduleNext();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    appEnv.detectionFps,
    isSessionActive,
    isWorkerReady,
    pushError,
    sendFocusBitmap,
    sendObjectBitmap,
    workersEnabled,
  ]);

  // Overlay drawing loop
  useEffect(() => {
    if (!isSessionActive) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const draw = () => {
      if (video.videoWidth && video.videoHeight) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fb = lastFaceBoxRef.current;
      if (fb) {
        const x = fb.minX * canvas.width;
        const y = fb.minY * canvas.height;
        const w = (fb.maxX - fb.minX) * canvas.width;
        const h = (fb.maxY - fb.minY) * canvas.height;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        const label = `face yaw:${fb.yaw?.toFixed(1) ?? '-'} pitch:${fb.pitch?.toFixed(1) ?? '-'} r:${fb.ratio.toFixed(2)}`;
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
        const pad = 4;
        const m = ctx.measureText(label);
        ctx.fillStyle = 'rgba(34,197,94,0.85)';
        ctx.fillRect(x, Math.max(0, y - 16), m.width + pad * 2, 16);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillText(label, x + pad, Math.max(12, y - 4));
      }
      const dets = lastDetectionsRef.current;
      if (dets && dets.length) {
        for (const d of dets) {
          const x = d.bbox.x * canvas.width;
          const y = d.bbox.y * canvas.height;
          const w = d.bbox.width * canvas.width;
          const h = d.bbox.height * canvas.height;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          const label = `${d.className} ${(d.score * 100).toFixed(0)}%`;
          ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
          const pad = 4;
          const m = ctx.measureText(label);
          ctx.fillStyle = 'rgba(245,158,11,0.9)';
          ctx.fillRect(x, Math.max(0, y - 16), m.width + pad * 2, 16);
          ctx.fillStyle = '#0a0a0a';
          ctx.fillText(label, x + pad, Math.max(12, y - 4));
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isSessionActive]);

  // FPS tracker
  useEffect(() => {
    if (!isSessionActive) return;
    let rafId = requestAnimationFrame(() => void 0);
    let lastTs = performance.now();
    let frames = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - lastTs;
      if (elapsed >= 1000) {
        const instantFps = (frames * 1000) / elapsed;
        updateFps(instantFps);
        frames = 0;
        lastTs = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isSessionActive, updateFps]);

  const handleStart = useCallback(async () => {
    if (isRunning || isStarting) return;
    setInternalErrors([]);
    clearDownloadUrl();
    setVideoRef(undefined);
    setRecordingBytes(undefined);

    // Enable workers immediately so detections/thumbnails flow even if tab starts hidden
    setWorkersEnabled(true);

    // Create session
    let currentSessionId: string;
    try {
      const serverSessionId = await apiCreateSession('Candidate');
      currentSessionId = beginSessionWithId(serverSessionId, 'Candidate');
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Failed to create session on server');
      currentSessionId = beginSession('Candidate');
    }
    setIsStarting(true);

    try {
      // First try with audio+video. If it fails (e.g., mic blocked), retry video-only so preview still works.
      let newStream: MediaStream | null = null;
      try {
        newStream = await requestStream({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: 'user',
          },
          audio: true,
        });
      } catch (primaryError) {
        pushError(
          primaryError instanceof Error
            ? primaryError.message
            : 'Camera/mic permission failed; retrying with camera only',
        );
        // Retry with video-only
        newStream = await requestStream({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: 'user',
          },
          audio: false,
        });
      }
      await attachStreamToVideo(newStream);
      startRecorder(newStream, currentSessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session';
      pushError(message);
      stopStream();
      cleanupVideoElement();
      resetRecorder();
      resetSession();
      resetObjectWorker();
      resetFocusWorker();
    } finally {
      setIsStarting(false);
    }
  }, [
    attachStreamToVideo,
    beginSessionWithId,
    cleanupVideoElement,
    clearDownloadUrl,
    isRunning,
    isStarting,
    pushError,
    requestStream,
    resetFocusWorker,
    resetRecorder,
    resetSession,
    setVideoRef,
    startRecorder,
    stopStream,
  ]);

  const handleStop = useCallback(async () => {
    if (!isRunning || isStopping) return;
    setIsStopping(true);
    try {
      const recording = await stopRecorder();
      stopStream();
      cleanupVideoElement();
      if (recording) {
        await persistRecording(recording);
        if (sessionId) {
          try {
            await apiUploadVideo(sessionId, recording.blob);
          } catch (e) {
            pushError(e instanceof Error ? e.message : 'Video upload failed');
          }
        }
      }
      if (sessionId) {
        const remaining = drainEvents();
        if (remaining.length) {
          try {
            await apiAppendEvents(sessionId, remaining);
          } catch (e) {
            pushError(e instanceof Error ? e.message : 'Failed to sync events');
          }
        }
        try {
          await apiEndSession(sessionId);
        } catch (e) {
          pushError(e instanceof Error ? e.message : 'Failed to end session on server');
        }
      }
    } catch (err) {
      pushError(err instanceof Error ? err.message : 'Failed to stop recorder');
    } finally {
      endSession();
      setIsStopping(false);
      resetObjectWorker();
      resetFocusWorker();
      setWorkersEnabled(false);
    }
  }, [
    cleanupVideoElement,
    endSession,
    isRunning,
    isStopping,
    persistRecording,
    pushError,
    stopRecorder,
    stopStream,
  ]);

  // Periodic event batching
  useEffect(() => {
    if (!isSessionActive || !sessionId) return;
    const interval = window.setInterval(async () => {
      const batch = drainEvents();
      if (!batch.length) return;
      try {
        await apiAppendEvents(sessionId, batch);
      } catch (e) {
        pushError(e instanceof Error ? e.message : 'Failed to append events');
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [drainEvents, isSessionActive, pushError, sessionId]);

  const handleDownload = useCallback(async () => {
    if (!sessionId) return pushError('No session available to download.');
    let url = downloadUrl;
    let bytes = recordingBytes;
    if (!url) {
      const stored = await loadRecording(sessionId);
      if (!stored) return pushError('No recording stored for this session yet.');
      url = URL.createObjectURL(stored.blob);
      bytes = stored.bytes;
      setDownloadUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setRecordingBytes(bytes);
      setVideoRef({ url, bytes });
    }
    if (!url) return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `focus-proctor-${sessionId}.webm`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [downloadUrl, pushError, recordingBytes, sessionId, setVideoRef]);

  return (
    <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <CameraStage
          videoRef={videoRef}
          canvasRef={canvasRef}
          isActive={isSessionActive}
          isLoading={isLoading}
          streamError={streamError}
        />
      </div>
      <div className="flex max-h-[720px] flex-col gap-6">
        <ControlsPanel
          onStart={handleStart}
          onStop={handleStop}
          isRunning={isRunning}
          isLoading={isLoading}
          isStopping={isStopping}
          focusState={focusState}
          fps={fps}
          avgFps={avgFps}
          recordingBytes={recordingBytes}
          onDownload={handleDownload}
          recordingReady={Boolean(downloadUrl ?? sessionVideo?.url)}
          errors={aggregatedErrors}
        />
        <EventFeed events={events} />
      </div>
    </section>
  );
};

export default InterviewPage;
