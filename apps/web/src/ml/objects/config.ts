import { appEnv, objectDetectionConfig } from '../../lib/env';
import type { ObjectDetectionRuntimeConfig } from './objectWorkerTypes';

type DetectionClass = 'phone' | 'book' | 'notebook' | 'paper' | 'laptop' | 'keyboard' | 'monitor';

type ClassEventMapping = Record<
  DetectionClass,
  { eventType: 'PhoneDetected' | 'NotesDetected' | 'ExtraDeviceDetected' }
>;

const CLASS_TO_EVENT: ClassEventMapping = {
  phone: { eventType: 'PhoneDetected' },
  book: { eventType: 'NotesDetected' },
  notebook: { eventType: 'NotesDetected' },
  paper: { eventType: 'NotesDetected' },
  laptop: { eventType: 'ExtraDeviceDetected' },
  keyboard: { eventType: 'ExtraDeviceDetected' },
  monitor: { eventType: 'ExtraDeviceDetected' },
};

const DEFAULT_MODEL_CLASS_LIST: DetectionClass[] = [
  'phone',
  'book',
  'notebook',
  'paper',
  'laptop',
  'keyboard',
  'monitor',
];

const resolveClasses = (): string[] => {
  if (appEnv.objectClasses && appEnv.objectClasses.length > 0) {
    return appEnv.objectClasses;
  }
  return DEFAULT_MODEL_CLASS_LIST;
};

export const getObjectRuntimeConfig = (): ObjectDetectionRuntimeConfig => {
  const frameInterval = Math.max(
    1,
    appEnv.objectFrameInterval ?? objectDetectionConfig.inferenceInterval,
  );
  const fps = Math.max(1, appEnv.detectionFps);
  const frameIntervalMs = (1000 / fps) * frameInterval;

  return {
    ...objectDetectionConfig,
    modelUrl: appEnv.objectModelUrl ?? '/models/yolo-detector.onnx',
    inputSize: appEnv.objectInputSize ?? 256,
    classes: resolveClasses(),
    frameInterval,
    frameIntervalMs,
  } satisfies ObjectDetectionRuntimeConfig;
};

export const mapDetectionToEventType = (className: string) => {
  const key = className.toLowerCase() as DetectionClass;
  return CLASS_TO_EVENT[key]?.eventType;
};
