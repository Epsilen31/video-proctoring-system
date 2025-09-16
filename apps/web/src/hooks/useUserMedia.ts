import { useCallback, useEffect, useState } from 'react';

export type MediaStreamConstraintsWithDevice = MediaStreamConstraints & {
  deviceId?: string;
};

interface UseUserMediaResult {
  stream: MediaStream | null;
  isRequesting: boolean;
  error: string | null;
  start: (constraints?: MediaStreamConstraintsWithDevice) => Promise<MediaStream>;
  stop: () => void;
}

const defaultConstraints: MediaStreamConstraintsWithDevice = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 360 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: 'user',
  },
  audio: false,
};

export const useUserMedia = (): UseUserMediaResult => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const start = useCallback(
    async (constraints?: MediaStreamConstraintsWithDevice) => {
      if (isRequesting) {
        throw new Error('Media request already in-flight');
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        const fallbackError = 'Camera access is not supported in this environment';
        setError(fallbackError);
        throw new Error(fallbackError);
      }

      setIsRequesting(true);
      setError(null);

      try {
        const nextStream = await navigator.mediaDevices.getUserMedia(
          constraints ?? defaultConstraints,
        );
        setStream((prev) => {
          prev?.getTracks().forEach((track) => track.stop());
          return nextStream;
        });
        return nextStream;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to access camera';
        setError(message);
        throw err;
      } finally {
        setIsRequesting(false);
      }
    },
    [isRequesting],
  );

  useEffect(
    () => () => {
      stream?.getTracks().forEach((track) => track.stop());
    },
    [stream],
  );

  return { stream, isRequesting, error, start, stop };
};
