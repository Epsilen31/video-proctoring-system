import { del, get, set } from 'idb-keyval';

import type { RecordingResult } from '../hooks/useMediaRecorder';

const VIDEO_KEY_PREFIX = 'focus-proctor:video:';

const buildKey = (sessionId: string): string => `${VIDEO_KEY_PREFIX}${sessionId}`;

export interface StoredRecording {
  mimeType: string;
  blob: Blob;
  bytes: number;
  createdAt: number;
}

export const saveRecording = async (recording: RecordingResult): Promise<void> => {
  const key = buildKey(recording.sessionId);
  const payload: StoredRecording = {
    mimeType: recording.mimeType,
    blob: recording.blob,
    bytes: recording.bytes,
    createdAt: recording.createdAt,
  };
  await set(key, payload);
};

export const loadRecording = async (sessionId: string): Promise<StoredRecording | undefined> => {
  const key = buildKey(sessionId);
  const result = await get<StoredRecording>(key);
  return result ?? undefined;
};

export const removeRecording = async (sessionId: string): Promise<void> => {
  await del(buildKey(sessionId));
};
