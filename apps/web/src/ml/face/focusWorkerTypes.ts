import type { FocusThresholdsConfig, EventType } from '@focus-proctor/types';

import type { FocusState } from '../../types/session';

export interface FocusWorkerInitPayload {
  thresholds: FocusThresholdsConfig;
  cooldownMs: number;
  modelAssetPath: string;
  wasmBaseUrl: string;
}

export interface FocusWorkerFramePayload {
  bitmap: ImageBitmap;
  timestamp: number;
}

export interface FocusWorkerEventPayload {
  type: EventType;
  startTs: number;
  endTs: number;
  durationMs: number;
  meta?: Record<string, unknown>;
}

export interface FocusWorkerStatePayload {
  focusState: FocusState;
  yaw: number | null;
  pitch: number | null;
  faceCount: number;
  ratio: number;
  timestamp: number;
  // Normalized bbox for the primary face, if present
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
}

export type FocusWorkerInboundMessage =
  | { type: 'INIT'; payload: FocusWorkerInitPayload }
  | { type: 'FRAME'; payload: FocusWorkerFramePayload }
  | { type: 'RESET' };

export type FocusWorkerOutboundMessage =
  | { type: 'READY' }
  | { type: 'STATE'; payload: FocusWorkerStatePayload }
  | { type: 'EVENT'; payload: FocusWorkerEventPayload }
  | { type: 'ERROR'; payload: { message: string } };
