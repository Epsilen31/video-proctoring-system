import type { FocusThresholdsConfig, ObjectDetectionConfig } from '@focus-proctor/types';

const toNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toRatio = (value: string | undefined, fallback: number): number => {
  const parsed = toNumber(value, fallback);
  return Math.min(Math.max(parsed, 0), 1);
};

const rawEnv = import.meta.env as Record<string, string | undefined>;

export interface AppEnvironment {
  apiUrl: string;
  apiJwt?: string;
  detectionFps: number;
  confidenceThreshold: number;
  nmsIou: number;
  lookAwaySeconds: number;
  noFaceSeconds: number;
  multiFaceSeconds: number;
  yawDegrees: number;
  pitchDegrees: number;
  lookAwayRatio: number;
  faceModelAssetPath: string;
  faceWasmBaseUrl: string;
  objectModelUrl?: string;
  objectInputSize?: number;
  objectClasses?: string[];
  objectFrameInterval?: number;
  objectBackend?: 'wasm' | 'webgpu';
  objectEnabled?: boolean;
}

const ensureSlash = (s: string) => (s.endsWith('/') ? s : `${s}/`);

export const appEnv: AppEnvironment = {
  apiUrl: rawEnv.VITE_API_URL ?? 'http://localhost:4000',
  apiJwt: rawEnv.VITE_API_JWT,
  detectionFps: toNumber(rawEnv.VITE_DET_FPS, 8),
  confidenceThreshold: toNumber(rawEnv.VITE_CONF_THRESH, 0.6),
  nmsIou: toNumber(rawEnv.VITE_NMS_IOU, 0.45),
  lookAwaySeconds: toNumber(rawEnv.VITE_LOOKAWAY_SEC, 5),
  noFaceSeconds: toNumber(rawEnv.VITE_NOFACE_SEC, 10),
  multiFaceSeconds: toNumber(rawEnv.VITE_MULTIFACE_SEC, 2),
  yawDegrees: toNumber(rawEnv.VITE_YAW_DEG, 20),
  pitchDegrees: toNumber(rawEnv.VITE_PITCH_DEG, 15),
  lookAwayRatio: toRatio(rawEnv.VITE_LOOKAWAY_RATIO, 0.7),
  faceModelAssetPath: rawEnv.VITE_FACE_MODEL_PATH ?? '/models/face_landmarker.task',
  faceWasmBaseUrl: ensureSlash(
    rawEnv.VITE_FACE_WASM_BASE ??
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm',
  ),
  objectModelUrl: rawEnv.VITE_OBJECT_MODEL_URL,
  objectInputSize: rawEnv.VITE_OBJECT_INPUT_SIZE
    ? Number(rawEnv.VITE_OBJECT_INPUT_SIZE)
    : undefined,
  objectClasses: rawEnv.VITE_OBJECT_CLASSES
    ? rawEnv.VITE_OBJECT_CLASSES.split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined,
  objectFrameInterval: rawEnv.VITE_OBJECT_FRAME_INTERVAL
    ? Number(rawEnv.VITE_OBJECT_FRAME_INTERVAL)
    : undefined,
  objectBackend: rawEnv.VITE_YOLO_BACKEND === 'webgpu' ? 'webgpu' : 'wasm',
  objectEnabled: rawEnv.VITE_OBJECT_ENABLED ? rawEnv.VITE_OBJECT_ENABLED === 'true' : undefined,
};

export const focusThresholds: FocusThresholdsConfig = {
  lookingAwaySeconds: appEnv.lookAwaySeconds,
  noFaceSeconds: appEnv.noFaceSeconds,
  multipleFacesSeconds: appEnv.multiFaceSeconds,
  yawDegrees: appEnv.yawDegrees,
  pitchDegrees: appEnv.pitchDegrees,
  samplingFps: appEnv.detectionFps,
  breachRatio: appEnv.lookAwayRatio,
};

export const objectDetectionConfig: ObjectDetectionConfig = {
  confidenceThreshold: appEnv.confidenceThreshold,
  nmsIou: appEnv.nmsIou,
  inferenceInterval: 3,
};

export const focusWorkerConfig = {
  thresholds: focusThresholds,
  cooldownMs: 1500,
  modelAssetPath: appEnv.faceModelAssetPath,
  wasmBaseUrl: appEnv.faceWasmBaseUrl,
};
