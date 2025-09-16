/// <reference lib="webworker" />

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

import type { EventType, FocusThresholdsConfig } from '@focus-proctor/types';
import type {
  FocusWorkerEventPayload,
  FocusWorkerInboundMessage,
  FocusWorkerOutboundMessage,
} from '../ml/face/focusWorkerTypes';
import type { FocusState } from '../types/session';

interface DetectionState {
  lookWindow: { ts: number; flagged: boolean }[];
  lookEventArmed: boolean;
  lastEvents: Record<EventType, number>;
  noFaceStart: number | null;
  multiFaceStart: number | null;
  focusState: FocusState;
}

let landmarker: FaceLandmarker | null = null;
let initPromise: Promise<void> | null = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;
let thresholds: FocusThresholdsConfig | null = null;
let cooldownMs = 1500;

const createEventTimestampMap = (): Record<EventType, number> => ({
  LookingAway: 0,
  NoFace: 0,
  MultipleFaces: 0,
  PhoneDetected: 0,
  NotesDetected: 0,
  ExtraDeviceDetected: 0,
});

const state: DetectionState = {
  lookWindow: [],
  lookEventArmed: true,
  lastEvents: createEventTimestampMap(),
  noFaceStart: null,
  multiFaceStart: null,
  focusState: 'focused',
};

const sendMessage = (message: FocusWorkerOutboundMessage) => {
  self.postMessage(message);
};

const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

const averageLandmarks = (landmarks: NormalizedLandmark[], indices: number[]) => {
  if (landmarks.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  let validCount = 0;
  const sum = indices.reduce(
    (acc, index) => {
      const lm = landmarks[index] ?? landmarks[0];
      if (!lm) {
        return acc;
      }
      validCount += 1;
      return {
        x: acc.x + lm.x,
        y: acc.y + lm.y,
        z: acc.z + (lm.z ?? 0),
      };
    },
    { x: 0, y: 0, z: 0 },
  );

  const count = validCount || 1;
  return {
    x: sum.x / count,
    y: sum.y / count,
    z: sum.z / count,
  };
};

const distance2D = (a: NormalizedLandmark, b: NormalizedLandmark): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const computeYaw = (landmarks: NormalizedLandmark[]): number => {
  const leftEye = averageLandmarks(landmarks, [33, 133]) as NormalizedLandmark;
  const rightEye = averageLandmarks(landmarks, [362, 263]) as NormalizedLandmark;
  const leftCheek = landmarks[234] ?? landmarks[0];
  const rightCheek = landmarks[454] ?? landmarks[landmarks.length - 1] ?? landmarks[0];

  if (!leftCheek || !rightCheek) {
    return 0;
  }

  const leftDist = distance2D(leftEye, leftCheek);
  const rightDist = distance2D(rightEye, rightCheek);
  const denom = (leftDist + rightDist) / 2 || 1;
  return radToDeg(Math.atan2(rightDist - leftDist, denom));
};

const computePitch = (landmarks: NormalizedLandmark[]): number => {
  const brow = averageLandmarks(landmarks, [10, 338, 297, 67]);
  const chin = landmarks[152] ?? landmarks[landmarks.length - 1];
  const nose = landmarks[1] ?? landmarks[0];

  if (!chin || !nose) {
    return 0;
  }

  const vertical = chin.y - brow.y;
  const depth = Math.abs(chin.z - nose.z) + 1e-6;
  return radToDeg(Math.atan2(vertical, depth));
};

const computeBoundingBox = (landmarks: NormalizedLandmark[]) => {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  landmarks.forEach((lm) => {
    minX = Math.min(minX, lm.x);
    minY = Math.min(minY, lm.y);
    maxX = Math.max(maxX, lm.x);
    maxY = Math.max(maxY, lm.y);
  });
  return { minX, minY, maxX, maxY };
};

const ensureCanvas = (width: number, height: number) => {
  if (!offscreenCanvas) {
    offscreenCanvas = new OffscreenCanvas(width, height);
  } else if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
  }

  if (!offscreenCtx && offscreenCanvas) {
    const context = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    offscreenCtx = context ?? null;
  }

  return offscreenCtx;
};

const resetAnalysisState = () => {
  state.lookWindow = [];
  state.lookEventArmed = true;
  state.noFaceStart = null;
  state.multiFaceStart = null;
  state.focusState = 'focused';
  state.lastEvents = createEventTimestampMap();
};

const triggerEvent = (payload: FocusWorkerEventPayload) => {
  state.lastEvents[payload.type] = payload.endTs;
  sendMessage({ type: 'EVENT', payload });
};

const handleLookAway = (
  faceLandmarks: NormalizedLandmark[],
  yaw: number,
  pitch: number,
  ratio: number,
  timestamp: number,
) => {
  if (!thresholds) {
    return;
  }
  const lookAwayMs = thresholds.lookingAwaySeconds * 1000;
  const earliest = state.lookWindow[0]?.ts ?? timestamp;
  if (
    ratio >= thresholds.breachRatio &&
    timestamp - earliest >= lookAwayMs &&
    state.lookEventArmed &&
    timestamp - state.lastEvents.LookingAway >= cooldownMs
  ) {
    const firstFlagged = state.lookWindow.find((entry) => entry.flagged);
    const startTs = firstFlagged?.ts ?? earliest;
    const bbox = computeBoundingBox(faceLandmarks);
    triggerEvent({
      type: 'LookingAway',
      startTs,
      endTs: timestamp,
      durationMs: timestamp - startTs,
      meta: {
        yaw,
        pitch,
        ratio,
        bbox,
      },
    });
    state.lookEventArmed = false;
  }

  if (ratio < thresholds.breachRatio * 0.5 || state.lookWindow.length === 0) {
    state.lookEventArmed = true;
  }
};

const handleNoFace = (timestamp: number) => {
  if (!thresholds) {
    return;
  }
  state.noFaceStart ??= timestamp;
  const elapsed = timestamp - state.noFaceStart;
  if (
    elapsed >= thresholds.noFaceSeconds * 1000 &&
    timestamp - state.lastEvents.NoFace >= cooldownMs
  ) {
    triggerEvent({
      type: 'NoFace',
      startTs: state.noFaceStart,
      endTs: timestamp,
      durationMs: elapsed,
    });
    state.noFaceStart = timestamp;
  }
};

const handleMultipleFaces = (timestamp: number, faceCount: number) => {
  if (!thresholds) {
    return;
  }
  state.multiFaceStart ??= timestamp;
  const elapsed = timestamp - state.multiFaceStart;
  if (
    elapsed >= thresholds.multipleFacesSeconds * 1000 &&
    timestamp - state.lastEvents.MultipleFaces >= cooldownMs
  ) {
    triggerEvent({
      type: 'MultipleFaces',
      startTs: state.multiFaceStart,
      endTs: timestamp,
      durationMs: elapsed,
      meta: { faceCount },
    });
    state.multiFaceStart = timestamp;
  }
};

const analyseResult = (result: FaceLandmarkerResult, timestamp: number) => {
  if (!thresholds) {
    return;
  }
  const faces = result.faceLandmarks ?? [];
  const faceCount = faces.length;
  const lookAwayWindowMs = thresholds.lookingAwaySeconds * 1000;

  let yaw: number | null = null;
  let pitch: number | null = null;
  let ratio = 0;
  let bbox: { minX: number; minY: number; maxX: number; maxY: number } | undefined;

  if (faceCount > 0) {
    const primaryFace = faces[0];
    if (!primaryFace || primaryFace.length === 0) {
      handleNoFace(timestamp);
      return;
    }
    yaw = computeYaw(primaryFace);
    pitch = computePitch(primaryFace);
    const bb = computeBoundingBox(primaryFace);
    bbox = bb;
    const isLookAway =
      Math.abs(yaw) > thresholds.yawDegrees || (pitch ?? 0) > thresholds.pitchDegrees;
    state.lookWindow.push({ ts: timestamp, flagged: isLookAway });
    state.lookWindow = state.lookWindow.filter((entry) => timestamp - entry.ts <= lookAwayWindowMs);

    const total = state.lookWindow.length;
    const flagged = state.lookWindow.reduce((acc, entry) => acc + (entry.flagged ? 1 : 0), 0);
    ratio = total > 0 ? flagged / total : 0;

    handleLookAway(primaryFace, yaw, pitch, ratio, timestamp);

    state.noFaceStart = null;
  } else {
    state.lookWindow = state.lookWindow.filter((entry) => timestamp - entry.ts <= lookAwayWindowMs);
    yaw = null;
    pitch = null;
    ratio = 0;
    handleNoFace(timestamp);
  }

  if (faceCount >= 2) {
    handleMultipleFaces(timestamp, faceCount);
  } else if (faceCount <= 1) {
    state.multiFaceStart = null;
  }

  let focusState: FocusState = 'focused';
  if (faceCount === 0) {
    const elapsed = state.noFaceStart ? timestamp - state.noFaceStart : 0;
    focusState = elapsed >= thresholds.noFaceSeconds * 1000 ? 'alert' : 'warning';
  } else if (faceCount >= 2) {
    const elapsed = state.multiFaceStart ? timestamp - state.multiFaceStart : 0;
    focusState = elapsed >= thresholds.multipleFacesSeconds * 1000 ? 'alert' : 'warning';
  } else if (ratio >= thresholds.breachRatio * 0.6) {
    focusState = 'warning';
  }

  state.focusState = focusState;
  sendMessage({
    type: 'STATE',
    payload: {
      focusState,
      yaw,
      pitch,
      faceCount,
      ratio,
      timestamp,
      bbox,
    },
  });
};

const ensureLandmarker = async () => {
  if (!initPromise) {
    throw new Error('Worker is not initialised');
  }
  if (!landmarker) {
    await initPromise;
  }
  if (!landmarker) {
    throw new Error('FaceLandmarker failed to initialise');
  }
  return landmarker;
};

const processFrame = async (bitmap: ImageBitmap, timestamp: number) => {
  try {
    const lm = await ensureLandmarker();
    // Downscale large frames to reduce CPU. Target max dimension ~480px.
    const srcWidth = bitmap.width;
    const srcHeight = bitmap.height;
    const maxSide = 480;
    const scale = Math.min(1, maxSide / Math.max(srcWidth, srcHeight));
    const width = Math.max(1, Math.round(srcWidth * scale));
    const height = Math.max(1, Math.round(srcHeight * scale));
    const context = ensureCanvas(width, height);
    if (!context || !offscreenCanvas) {
      bitmap.close();
      throw new Error('Unable to create offscreen canvas');
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    bitmap.close();
    const result = lm.detect(imageData);
    analyseResult(result, timestamp);
  } catch (error) {
    bitmap.close();
    const message = error instanceof Error ? error.message : 'focus worker failure';
    sendMessage({ type: 'ERROR', payload: { message } });
  }
};

self.addEventListener('message', (event: MessageEvent<FocusWorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === 'INIT') {
    thresholds = message.payload.thresholds;
    cooldownMs = message.payload.cooldownMs;
    resetAnalysisState();

    initPromise = (async () => {
      try {
        const resolver = await FilesetResolver.forVisionTasks(message.payload.wasmBaseUrl);
        landmarker = await FaceLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath: message.payload.modelAssetPath,
          },
          runningMode: 'IMAGE',
          numFaces: 1,
          outputFaceBlendshapes: false,
        });
        sendMessage({ type: 'READY' });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Failed to load face models';
        sendMessage({ type: 'ERROR', payload: { message: messageText } });
      }
    })();
    return;
  }

  if (message.type === 'FRAME') {
    void processFrame(message.payload.bitmap, message.payload.timestamp);
    return;
  }

  if (message.type === 'RESET') {
    resetAnalysisState();
    return;
  }
});

export {};
