import { useCallback, useRef, useState } from 'react';

const DEFAULT_MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export interface RecordingResult {
  sessionId: string;
  blob: Blob;
  mimeType: string;
  bytes: number;
  createdAt: number;
}

interface UseMediaRecorderOptions {
  mimeTypes?: string[];
  timesliceMs?: number;
}

interface UseMediaRecorderResult {
  status: 'idle' | 'recording' | 'error';
  error: string | null;
  start: (stream: MediaStream, sessionId: string) => void;
  stop: () => Promise<RecordingResult | null>;
  reset: () => void;
}

const pickSupportedMimeType = (mimeTypes: string[]): string | undefined => {
  if (typeof MediaRecorder === 'undefined') {
    return undefined;
  }
  return mimeTypes.find((entry) => MediaRecorder.isTypeSupported(entry));
};

export const useMediaRecorder = (options?: UseMediaRecorderOptions): UseMediaRecorderResult => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopPromiseRef = useRef<Promise<RecordingResult> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    recorderRef.current = null;
    stopPromiseRef.current = null;
    chunksRef.current = [];
    sessionIdRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  const start = useCallback(
    (stream: MediaStream, sessionId: string) => {
      if (recorderRef.current) {
        throw new Error('Recorder is already active');
      }

      if (typeof MediaRecorder === 'undefined') {
        const message = 'MediaRecorder is not supported in this browser';
        setError(message);
        setStatus('error');
        throw new Error(message);
      }

      const mimeCandidate = pickSupportedMimeType(options?.mimeTypes ?? DEFAULT_MIME_TYPES);
      const config: MediaRecorderOptions = mimeCandidate ? { mimeType: mimeCandidate } : {};

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, config);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to start recorder';
        setError(message);
        setStatus('error');
        throw (err instanceof Error ? err : new Error(message));
      }

      chunksRef.current = [];
      sessionIdRef.current = sessionId;

      const stopPromise = new Promise<RecordingResult>((resolve, reject) => {
        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          const domError = (event as { error?: DOMException }).error;
          const message = domError?.message ?? 'MediaRecorder error';
          setError(message);
          setStatus('error');
          reject(domError ?? new Error(message));
        };

        recorder.onstop = () => {
          const mimeType = recorder.mimeType ?? mimeCandidate ?? 'video/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });
          resolve({
            sessionId: sessionIdRef.current ?? sessionId,
            blob,
            mimeType,
            bytes: blob.size,
            createdAt: Date.now(),
          });
        };
      });

      recorder.start(options?.timesliceMs ?? 1000);
      recorderRef.current = recorder;
      stopPromiseRef.current = stopPromise;
      setStatus('recording');
      setError(null);
    },
    [options?.mimeTypes, options?.timesliceMs],
  );

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return null;
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    try {
      const result = await stopPromiseRef.current;
      reset();
      return result ?? null;
    } catch (err) {
      reset();
      throw (err instanceof Error ? err : new Error('Failed to stop recorder'));
    }
  }, [reset]);

  return {
    status,
    error,
    start,
    stop,
    reset,
  };
};

