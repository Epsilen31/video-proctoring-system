export type EventType =
  | 'LookingAway'
  | 'NoFace'
  | 'MultipleFaces'
  | 'PhoneDetected'
  | 'NotesDetected'
  | 'ExtraDeviceDetected';

export interface ProctorEvent {
  id: string;
  ts: number;
  type: EventType;
  duration?: number;
  meta?: Record<string, unknown>;
  frameThumb?: string;
}

export interface SessionVideoReference {
  url?: string;
  bytes?: number;
}

export interface SessionMetrics {
  avgFps: number;
  droppedFrames: number;
}

export interface Session {
  _id: string;
  candidateId?: string;
  candidateName: string;
  startedAt: number;
  endedAt?: number;
  events: ProctorEvent[];
  videoRef?: SessionVideoReference;
  metrics?: SessionMetrics;
}

export interface ReportCountsByType {
  [key: string]: number;
  LookingAway: number;
  NoFace: number;
  MultipleFaces: number;
  PhoneDetected: number;
  NotesDetected: number;
  ExtraDeviceDetected: number;
}

export interface IntegrityTimelinePoint {
  ts: number;
  score: number;
}

export interface IntegrityReport {
  sessionId: string;
  integrityScore: number;
  countsByType: ReportCountsByType;
  durationMs: number;
  timeline: IntegrityTimelinePoint[];
}

export interface FocusThresholdsConfig {
  lookingAwaySeconds: number;
  noFaceSeconds: number;
  multipleFacesSeconds: number;
  yawDegrees: number;
  pitchDegrees: number;
  samplingFps: number;
  breachRatio: number;
}

export interface ObjectDetectionConfig {
  confidenceThreshold: number;
  nmsIou: number;
  inferenceInterval: number;
}

export interface EventEpisode {
  type: EventType;
  startedAt: number;
  endedAt: number;
  count: number;
}

export interface UploadVideoResponse {
  url: string;
}

// Scoring utilities
export const computeIntegrityScore = (counts: ReportCountsByType): number => {
  const penalty =
    5 * counts.LookingAway +
    10 * counts.NoFace +
    15 * counts.MultipleFaces +
    20 * counts.PhoneDetected +
    10 * counts.NotesDetected +
    15 * counts.ExtraDeviceDetected;
  return Math.max(0, Math.min(100, 100 - penalty));
};

export const countEventsByType = (events: ProctorEvent[]): ReportCountsByType => {
  const base: ReportCountsByType = {
    LookingAway: 0,
    NoFace: 0,
    MultipleFaces: 0,
    PhoneDetected: 0,
    NotesDetected: 0,
    ExtraDeviceDetected: 0,
  };
  for (const ev of events) {
    switch (ev.type) {
      case 'LookingAway':
        base.LookingAway += 1;
        break;
      case 'NoFace':
        base.NoFace += 1;
        break;
      case 'MultipleFaces':
        base.MultipleFaces += 1;
        break;
      case 'PhoneDetected':
        base.PhoneDetected += 1;
        break;
      case 'NotesDetected':
        base.NotesDetected += 1;
        break;
      case 'ExtraDeviceDetected':
        base.ExtraDeviceDetected += 1;
        break;
      default:
        break;
    }
  }
  return base;
};

export const buildIntegrityTimeline = (
  events: ProctorEvent[],
  startedAt: number,
  endedAt: number,
): IntegrityTimelinePoint[] => {
  const points: IntegrityTimelinePoint[] = [];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  let counts = countEventsByType([]);
  points.push({ ts: startedAt, score: 100 });
  sorted.forEach((ev) => {
    switch (ev.type) {
      case 'LookingAway':
        counts.LookingAway += 1;
        break;
      case 'NoFace':
        counts.NoFace += 1;
        break;
      case 'MultipleFaces':
        counts.MultipleFaces += 1;
        break;
      case 'PhoneDetected':
        counts.PhoneDetected += 1;
        break;
      case 'NotesDetected':
        counts.NotesDetected += 1;
        break;
      case 'ExtraDeviceDetected':
        counts.ExtraDeviceDetected += 1;
        break;
      default:
        break;
    }
    points.push({ ts: ev.ts, score: computeIntegrityScore(counts) });
  });
  points.push({ ts: endedAt, score: computeIntegrityScore(counts) });
  return points;
};
