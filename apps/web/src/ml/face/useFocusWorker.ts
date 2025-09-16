import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProctorEvent } from '@focus-proctor/types';

import { focusWorkerConfig } from '../../lib/env';
import { useSessionStore } from '../../store/session';
import type {
  FocusWorkerInboundMessage,
  FocusWorkerOutboundMessage,
  FocusWorkerStatePayload,
} from './focusWorkerTypes';

const FOCUS_WORKER_URL = new URL('../../workers/focusWorker.ts', import.meta.url);

interface UseFocusWorkerOptions {
  onError?: (message: string) => void;
  onState?: (payload: FocusWorkerStatePayload) => void;
  enabled?: boolean;
}

interface UseFocusWorkerResult {
  ready: boolean;
  sendBitmap: (bitmap: ImageBitmap, timestamp: number) => void;
  reset: () => void;
}

export const useFocusWorker = ({
  onError,
  onState,
  enabled = true,
}: UseFocusWorkerOptions): UseFocusWorkerResult => {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const captureInFlightRef = useRef(false);

  const logEvent = useSessionStore((state) => state.logEvent);
  const setFocusState = useSessionStore((state) => state.setFocusState);

  const pushError = useCallback(
    (message: string) => {
      if (onError) onError(message);
    },
    [onError],
  );

  useEffect(() => {
    if (!enabled) {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      setReady(false);
      captureInFlightRef.current = false;
      return;
    }

    const worker = new Worker(FOCUS_WORKER_URL, { type: 'module' });
    workerRef.current = worker;

    const handleMessage = (event: MessageEvent<FocusWorkerOutboundMessage>) => {
      const message = event.data;
      if (message.type === 'READY') {
        setReady(true);
        captureInFlightRef.current = false;
        return;
      }
      if (message.type === 'STATE') {
        const payload = message.payload;
        setFocusState(payload.focusState);
        if (onState) onState(payload);
        return;
      }
      if (message.type === 'EVENT') {
        const ev: ProctorEvent = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          type: message.payload.type,
          duration: message.payload.durationMs,
          meta: message.payload.meta,
        };
        logEvent(ev);
        return;
      }
      if (message.type === 'ERROR') {
        pushError(message.payload.message);
        return;
      }
    };

    const handleError = (event: ErrorEvent) => {
      pushError(event.message);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    // INIT
    const initMessage: FocusWorkerInboundMessage = {
      type: 'INIT',
      payload: { ...focusWorkerConfig },
    };
    worker.postMessage(initMessage);

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
      workerRef.current = null;
      setReady(false);
      captureInFlightRef.current = false;
    };
  }, [enabled, logEvent, onState, pushError, setFocusState]);

  const sendBitmap = useCallback(
    (bitmap: ImageBitmap, timestamp: number) => {
      const worker = workerRef.current;
      if (!enabled || !worker || !ready) {
        bitmap.close();
        return;
      }
      try {
        const msg: FocusWorkerInboundMessage = {
          type: 'FRAME',
          payload: { bitmap, timestamp },
        };
        // Transfer bitmap
        worker.postMessage(msg, [bitmap as unknown as Transferable]);
      } catch (error) {
        bitmap.close();
        const message = error instanceof Error ? error.message : 'Focus worker post failed';
        pushError(message);
      }
    },
    [enabled, pushError, ready],
  );

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'RESET' } as FocusWorkerInboundMessage);
    captureInFlightRef.current = false;
  }, []);

  return { ready, sendBitmap, reset };
};
