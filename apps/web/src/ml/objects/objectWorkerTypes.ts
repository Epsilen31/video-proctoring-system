import type { ObjectDetectionConfig } from '@focus-proctor/types';

export interface YoloInitPayload {
  modelUrl: string;
  inputSize: number;
  classes: string[];
  confidence: number;
  nmsIou: number;
  frameInterval: number;
  backend?: 'wasm' | 'webgpu';
}

export interface ObjectDetectionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObjectDetectionResult {
  className: string;
  score: number;
  bbox: ObjectDetectionBoundingBox;
}

export interface ObjectWorkerFramePayload {
  bitmap: ImageBitmap;
  timestamp: number;
}

export interface ObjectWorkerErrorPayload {
  message: string;
}

export type ObjectWorkerInboundMessage =
  | { type: 'INIT'; payload: YoloInitPayload }
  | { type: 'FRAME'; payload: ObjectWorkerFramePayload }
  | { type: 'RESET' };

export type ObjectWorkerOutboundMessage =
  | { type: 'READY' }
  | { type: 'RESULTS'; payload: { timestamp: number; detections: ObjectDetectionResult[] } }
  | { type: 'ERROR'; payload: ObjectWorkerErrorPayload };

export interface ObjectDetectionRuntimeConfig extends ObjectDetectionConfig {
  modelUrl: string;
  inputSize: number;
  classes: string[];
  frameInterval: number;
  frameIntervalMs: number;
}
