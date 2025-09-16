/// <reference lib="webworker" />

import { InferenceSession, Tensor, env } from 'onnxruntime-web';

import type {
  ObjectDetectionBoundingBox,
  ObjectDetectionResult,
  ObjectWorkerFramePayload,
  ObjectWorkerInboundMessage,
  ObjectWorkerOutboundMessage,
  YoloInitPayload,
} from '../ml/objects/objectWorkerTypes';

interface LetterboxMetadata {
  tensor: Float32Array;
  inputSize: number;
  scale: number;
  padX: number;
  padY: number;
  originalWidth: number;
  originalHeight: number;
}

// Configure ORT WASM asset path to avoid loading HTML (404) and magic word errors
env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';
// Optional tuning
// Run single-threaded and disable proxy worker to avoid importScripts usage under module workers
env.wasm.numThreads = 1;
// Disabling proxy prevents ORT from spawning a nested worker that may rely on importScripts
// and reduces memory pressure on some browsers
env.wasm.proxy = false as unknown as boolean;

let session: InferenceSession | null = null;
let runtimeConfig: YoloInitPayload | null = null;
// NOTE: make these nullable (string | null) since we assign null during RESET/INIT.
let inputName: string | null = null;
let outputName: string | null = null;

const ensureSession = async () => {
  if (!runtimeConfig) throw new Error('Object worker not initialised');
  if (!session) {
    const providers = runtimeConfig.backend === 'webgpu' ? (['webgpu', 'wasm'] as const) : (['wasm'] as const);
    session = await InferenceSession.create(runtimeConfig.modelUrl, {
      executionProviders: providers as unknown as string[],
    });
    inputName = session.inputNames[0] ?? null;
    outputName = session.outputNames[0] ?? null;
  }
  return session;
};

const ensureCanvas = (size: number) => {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create offscreen canvas context');
  return { canvas, ctx };
};

const letterboxBitmap = (bitmap: ImageBitmap, inputSize: number): LetterboxMetadata => {
  const { ctx } = ensureCanvas(inputSize);

  const iw = bitmap.width;
  const ih = bitmap.height;
  const scale = Math.min(inputSize / iw, inputSize / ih);
  const resizedWidth = Math.round(iw * scale);
  const resizedHeight = Math.round(ih * scale);
  const padX = Math.floor((inputSize - resizedWidth) / 2);
  const padY = Math.floor((inputSize - resizedHeight) / 2);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, inputSize, inputSize);
  ctx.drawImage(bitmap, padX, padY, resizedWidth, resizedHeight);

  const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
  const { data } = imageData;
  const tensor = new Float32Array(inputSize * inputSize * 3);
  const area = inputSize * inputSize;

  for (let i = 0; i < area; i += 1) {
    const r = data[i * 4]! / 255;
    const g = data[i * 4 + 1]! / 255;
    const b = data[i * 4 + 2]! / 255;

    tensor[i] = r;
    tensor[i + area] = g;
    tensor[i + area * 2] = b;
  }

  return { tensor, inputSize, scale, padX, padY, originalWidth: iw, originalHeight: ih };
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const toBoundingBox = (
  cx: number,
  cy: number,
  width: number,
  height: number,
  meta: LetterboxMetadata,
): ObjectDetectionBoundingBox => {
  const x1 = (cx - width / 2 - meta.padX) / meta.scale;
  const y1 = (cy - height / 2 - meta.padY) / meta.scale;
  const finalWidth = width / meta.scale;
  const finalHeight = height / meta.scale;

  const normalizedX = clamp01(x1 / meta.originalWidth);
  const normalizedY = clamp01(y1 / meta.originalHeight);
  const normalizedW = clamp01(finalWidth / meta.originalWidth);
  const normalizedH = clamp01(finalHeight / meta.originalHeight);

  return { x: normalizedX, y: normalizedY, width: normalizedW, height: normalizedH };
};

const computeIoU = (a: ObjectDetectionBoundingBox, b: ObjectDetectionBoundingBox) => {
  const ax1 = a.x,
    ay1 = a.y,
    ax2 = a.x + a.width,
    ay2 = a.y + a.height;
  const bx1 = b.x,
    by1 = b.y,
    bx2 = b.x + b.width,
    by2 = b.y + b.height;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);

  const union = areaA + areaB - interArea;
  return union <= 0 ? 0 : interArea / union;
};

const nonMaxSuppression = (
  detections: ObjectDetectionResult[],
  iouThreshold: number,
): ObjectDetectionResult[] => {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const selected: ObjectDetectionResult[] = [];

  for (const candidate of sorted) {
    const ok = selected.every((ex) => computeIoU(ex.bbox, candidate.bbox) < iouThreshold);
    if (ok) selected.push(candidate);
  }
  return selected;
};

const getMaxClassScore = (
  data: Float32Array,
  base: number,
  step: number,
  classesCount: number,
): { maxClassScore: number; classIndex: number } => {
  let maxClassScore = 0;
  let classIndex = -1;
  for (let j = 0; j < classesCount; j += 1) {
    const classScore = Number(data[base + (5 + j) * step] ?? 0);
    if (classScore > maxClassScore) {
      maxClassScore = classScore;
      classIndex = j;
    }
  }
  return { maxClassScore, classIndex };
};

const createDetectionResult = (
  data: Float32Array,
  base: number,
  step: number,
  meta: LetterboxMetadata,
  config: YoloInitPayload,
  classesCount: number,
): ObjectDetectionResult | null => {
  const cx = Number(data[base + 0 * step] ?? 0);
  const cy = Number(data[base + 1 * step] ?? 0);
  const width = Number(data[base + 2 * step] ?? 0);
  const height = Number(data[base + 3 * step] ?? 0);
  const objectConfidence = Number(data[base + 4 * step] ?? 0);

  const { maxClassScore, classIndex } = getMaxClassScore(data, base, step, classesCount);
  if (classIndex === -1) return null;

  const score = objectConfidence * maxClassScore;
  if (score < config.confidence) return null;

  const bbox = toBoundingBox(cx, cy, width, height, meta);
  return {
    className: config.classes[classIndex] ?? `class_${classIndex}`,
    score,
    bbox,
  };
};

const parseDetections = (
  tensor: Tensor,
  meta: LetterboxMetadata,
  config: YoloInitPayload,
): ObjectDetectionResult[] => {
  const { data, dims } = tensor as unknown as { data: Float32Array; dims?: number[] };
  if (!dims || dims.length < 3) return [];

  const batch = dims[0]!;
  const d1 = dims[1]!;
  const d2 = dims[2]!;
  if (batch !== 1) return [];

  const rowMajor = Math.max(d1, d2) >= 6 && d2 >= 6;
  const count: number = rowMajor ? d1 : d2;
  const attributes: number = rowMajor ? d2 : d1;
  if (attributes < 6 || count <= 0) return [];

  const results: ObjectDetectionResult[] = [];
  const classesCount = config.classes.length;

  for (let i = 0; i < count; i += 1) {
    const base = rowMajor ? i * attributes : i;
    const step: number = rowMajor ? 1 : count;

    const detection = createDetectionResult(data, base, step, meta, config, classesCount);
    if (detection) {
      results.push(detection);
    }
  }

  return nonMaxSuppression(results, config.nmsIou);
};

const runInference = async (frame: ObjectWorkerFramePayload) => {
  if (!runtimeConfig) throw new Error('Worker not initialised');

  const letter = letterboxBitmap(frame.bitmap, runtimeConfig.inputSize);
  frame.bitmap.close();

  const inputTensor = new Tensor('float32', letter.tensor, [
    1,
    3,
    runtimeConfig.inputSize,
    runtimeConfig.inputSize,
  ]);
  const model = await ensureSession();

  if (!inputName || !outputName) throw new Error('Model inputs not resolved');

  const feeds: Record<string, Tensor> = { [inputName]: inputTensor };
  const outputs = await model.run(feeds);

  // Some models may not expose stable output names; fall back to first output
  const candidate = outputName && outputs[outputName] ? outputName : Object.keys(outputs)[0];
  if (!candidate) throw new Error('Model output missing');
  const resolvedOutputName: string = candidate;

  const outputTensor = outputs[resolvedOutputName];
  if (!outputTensor) throw new Error('Model output missing');

  const detections = parseDetections(outputTensor, letter, runtimeConfig);

  const message: ObjectWorkerOutboundMessage = {
    type: 'RESULTS',
    payload: { timestamp: frame.timestamp, detections },
  };
  self.postMessage(message);
};

self.addEventListener('message', (event: MessageEvent<ObjectWorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === 'INIT') {
    runtimeConfig = message.payload;
    session = null;
    inputName = null; // now allowed by the declared type
    outputName = null; // now allowed by the declared type

    ensureSession()
      .then(() => {
        const readyMessage: ObjectWorkerOutboundMessage = { type: 'READY' };
        self.postMessage(readyMessage);
      })
      .catch((error: unknown) => {
        const messageText =
          error instanceof Error ? error.message : 'Failed to initialise object worker';
        const errorMessage: ObjectWorkerOutboundMessage = {
          type: 'ERROR',
          payload: { message: messageText },
        };
        self.postMessage(errorMessage);
      });

    return;
  }

  if (message.type === 'FRAME') {
    runInference(message.payload).catch((error: unknown) => {
      const messageText =
        error instanceof Error ? error.message : 'Object worker inference failure';
      const errorMessage: ObjectWorkerOutboundMessage = {
        type: 'ERROR',
        payload: { message: messageText },
      };
      self.postMessage(errorMessage);
    });
    return;
  }

  if (message.type === 'RESET') {
    // No-op; state is episodic per inference.
  }
});

export {};
