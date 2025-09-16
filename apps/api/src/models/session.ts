import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

const ProctorEventSchema = new Schema(
  {
    id: { type: String, required: true },
    ts: { type: Number, required: true },
    type: { type: String, required: true, index: true },
    duration: { type: Number, required: false },
    meta: { type: Schema.Types.Mixed, required: false },
    frameThumb: { type: String, required: false },
  },
  { _id: false },
);

const SessionSchema = new Schema(
  {
    candidateId: { type: String, required: false },
    candidateName: { type: String, required: true },
    startedAt: { type: Number, required: true, index: true },
    endedAt: { type: Number, required: false, index: true },
    events: { type: [ProctorEventSchema], default: [] },
    videoRef: {
      url: { type: String, required: false },
      bytes: { type: Number, required: false },
    },
    metrics: {
      avgFps: { type: Number, required: false },
      droppedFrames: { type: Number, required: false },
    },
  },
  { timestamps: true },
);

export interface SessionDoc {
  candidateId?: string;
  candidateName: string;
  startedAt: number;
  endedAt?: number;
  events: {
    id: string;
    ts: number;
    type: string;
    duration?: number;
    meta?: unknown;
    frameThumb?: string;
  }[];
  videoRef?: { url?: string; bytes?: number };
  metrics?: { avgFps?: number; droppedFrames?: number };
}

export type SessionDocument = HydratedDocument<SessionDoc>;

export const SessionModel: Model<SessionDoc> =
  (mongoose.models.Session as Model<SessionDoc>) ||
  mongoose.model<SessionDoc>('Session', SessionSchema);
