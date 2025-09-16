import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { ProctorEvent } from '@focus-proctor/types';

import { captureFrameThumbnail } from '../../lib/video';
import { useSessionStore } from '../../store/session';
import { getObjectRuntimeConfig, mapDetectionToEventType } from './config';
import type {
  ObjectDetectionResult,
  ObjectWorkerInboundMessage,
  ObjectWorkerOutboundMessage,
  YoloInitPayload,
} from './objectWorkerTypes';

const OBJECT_WORKER_URL = new URL('../../workers/objectWorker.ts', import.meta.url);

interface UseObjectWorkerOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  onError?: (message: string) => void;
  // Optional callback to surface detections for overlay drawing
  onDetections?: (timestamp: number, detections: ObjectDetectionResult[]) => void;
  // Defer worker initialization until enabled is true
  enabled?: boolean;
}

interface UseObjectWorkerResult {
  ready: boolean;
  sendFrame: (timestamp: number) => void;
  sendBitmap: (bitmap: ImageBitmap, timestamp: number) => void;
  reset: () => void;
}

export const useObjectWorker = ({
  videoRef,
  onError,
  onDetections,
  enabled = true,
}: UseObjectWorkerOptions): UseObjectWorkerResult => {
  const workerRef = useRef<Worker | null>(null);
  const runtimeConfigRef = useRef(getObjectRuntimeConfig());
  const captureInFlightRef = useRef(false);
  const lastSentTsRef = useRef(0);
  const [ready, setReady] = useState(false);

  const logEvent = useSessionStore((state) => state.logEvent);

  const pushError = useCallback(
    (message: string) => {
      if (onError) {
        onError(message);
      }
    },
    [onError],
  );

  useEffect(() => {
    if (!enabled) {
      // If toggled off, ensure any existing worker is terminated
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      setReady(false);
      captureInFlightRef.current = false;
      return;
    }

    // Use module worker for proper Vite dev bundling
    const worker = new Worker(OBJECT_WORKER_URL, { type: 'module' });
    workerRef.current = worker;

    const handleResults = (timestamp: number, detections: ObjectDetectionResult[]) => {
      const video = videoRef.current;
      const frameThumb = video ? (captureFrameThumbnail(video) ?? undefined) : undefined;
      const now = Date.now();

      detections.forEach((detection) => {
        const eventType = mapDetectionToEventType(detection.className);
        if (!eventType) {
          return;
        }
        const event: ProctorEvent = {
          id: crypto.randomUUID(),
          ts: now,
          type: eventType,
          meta: {
            score: detection.score,
            bbox: detection.bbox,
            sourceTs: timestamp,
          },
          frameThumb,
        };
        logEvent(event);
      });

      if (onDetections) {
        onDetections(timestamp, detections);
      }
    };

    const handleMessage = (event: MessageEvent<ObjectWorkerOutboundMessage>) => {
      const message = event.data;
      if (message.type === 'READY') {
        setReady(true);
        captureInFlightRef.current = false;
        return;
      }

      if (message.type === 'RESULTS') {
        handleResults(message.payload.timestamp, message.payload.detections);
        captureInFlightRef.current = false;
        return;
      }

      if (message.type === 'ERROR') {
        pushError(message.payload.message);
        captureInFlightRef.current = false;
      }
    };

    const handleError = (event: ErrorEvent) => {
      pushError(event.message);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    const config = runtimeConfigRef.current;
    const payload: YoloInitPayload = {
      modelUrl: config.modelUrl,
      inputSize: config.inputSize,
      classes: config.classes,
      confidence: config.confidenceThreshold,
      nmsIou: config.nmsIou,
      frameInterval: config.frameInterval,
      backend: __FOCUS_ENV__?.VITE_YOLO_BACKEND === 'webgpu' ? 'webgpu' : 'wasm',
    };

    worker.postMessage({ type: 'INIT', payload } satisfies ObjectWorkerInboundMessage);

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
      workerRef.current = null;
      setReady(false);
      captureInFlightRef.current = false;
    };
  }, [enabled, logEvent, onDetections, pushError, videoRef]);

  const sendFrame = useCallback(
    (timestamp: number) => {
      const worker = workerRef.current;
      const config = runtimeConfigRef.current;
      if (!enabled || !worker || !ready) {
        return;
      }

      const video = videoRef.current;
      if (!video || captureInFlightRef.current) {
        return;
      }

      if (timestamp - lastSentTsRef.current < config.frameIntervalMs) {
        return;
      }

      captureInFlightRef.current = true;
      lastSentTsRef.current = timestamp;

      const maxSide = 640;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth || maxSide, video.videoHeight || maxSide));
      const resizeWidth = Math.max(1, Math.round((video.videoWidth || maxSide) * scale));
      const resizeHeight = Math.max(1, Math.round((video.videoHeight || maxSide) * scale));
      const opts: ImageBitmapOptions = {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
        resizeWidth,
        resizeHeight,
        resizeQuality: 'low',
      } as any;
      createImageBitmap(video, opts)
        .then((bitmap) => {
          worker.postMessage(
            { type: 'FRAME', payload: { bitmap, timestamp } } satisfies ObjectWorkerInboundMessage,
            [bitmap],
          );
        })
        .catch((error) => {
          captureInFlightRef.current = false;
          const message =
            error instanceof Error ? error.message : 'Object worker frame capture failed';
          pushError(message);
        });
    },
    [enabled, pushError, ready, videoRef],
  );

  const sendBitmap = useCallback(
    (bitmap: ImageBitmap, timestamp: number) => {
      const worker = workerRef.current;
      if (!enabled || !worker || !ready) {
        bitmap.close();
        return;
      }
      try {
        worker.postMessage(
          { type: 'FRAME', payload: { bitmap, timestamp } } satisfies ObjectWorkerInboundMessage,
          [bitmap],
        );
      } catch (error) {
        bitmap.close();
        const message = error instanceof Error ? error.message : 'Object worker post failed';
        pushError(message);
      }
    },
    [enabled, pushError, ready],
  );

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'RESET' } satisfies ObjectWorkerInboundMessage);
    captureInFlightRef.current = false;
    lastSentTsRef.current = 0;
  }, []);

  return { ready, sendFrame, sendBitmap, reset };
};
