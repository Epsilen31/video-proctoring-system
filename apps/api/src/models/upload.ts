import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

const UploadSchema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    storage: { type: String, required: true, default: 'local' },
  },
  { timestamps: true },
);

export interface UploadDoc {
  sessionId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  storage: string;
}

export type UploadDocument = HydratedDocument<UploadDoc>;

export const UploadModel: Model<UploadDoc> =
  (mongoose.models.Upload as Model<UploadDoc>) || mongoose.model<UploadDoc>('Upload', UploadSchema);
