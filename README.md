# Focus Proctor — Real-time Web Proctoring

This repository contains a production‑ready web proctoring system with:

- Web app (React + Vite + TypeScript + Tailwind, Zustand, React Query)
- CV/ML in Web Workers (MediaPipe FaceDetection/FaceMesh proxies, YOLO via ONNX Runtime Web)
- API (Node.js + Express + TypeScript + MongoDB + Zod + Multer)
- Recording to IndexedDB, event logging, integrity scoring, and reporting (charts + CSV/JSON + print‑to‑PDF)

## Installation

README must include installation & usage steps.

Prerequisites: Node 20+, pnpm, and MongoDB.

1. Clone and install

```bash
git clone <this-repo>
cd focus-proctor
pnpm install
```

2. Place model files (required for detections)

- Web models live under `apps/web/public/models`
- Place the following files:
  - `face_landmarker.task` (MediaPipe tasks-vision face landmarker)
  - `yolo-detector.onnx` (web‑friendly YOLO ONNX model)

3. Configure environment

- Web: create `apps/web/.env` if you need overrides (defaults work for local)
- API: create `apps/api/.env` (Mongo URL, port, optional CORS/JWT)

Example `apps/api/.env`:

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/focusproctor
```

4. Start in development

```bash
pnpm dev:api   # http://localhost:4000
pnpm dev:web   # http://localhost:5173
```

Run services directly without Docker. Ensure MongoDB is running locally on `mongodb://127.0.0.1:27017/focusproctor` (or adjust `apps/api/.env`).

## Usage

1. Open the web app in your browser (`http://localhost:5173`).

2. Click “Start session” and allow camera (and microphone if prompted). If the mic is unavailable or blocked, the app will fall back to camera‑only; the preview and recording will still work.

3. Live view and overlays

- The left panel shows your camera. Bounding boxes appear for detected objects; a green box shows the detected face when enabled.
- The right panel shows live FPS metrics and focus status.

4. Event feed

- As the object worker detects phones/notes/extra devices, events appear with timestamps and a thumbnail.
- If you see no events, ensure the YOLO model file exists or set `VITE_OBJECT_MODEL_URL` to a reachable URL.

5. Recording

- Click “Stop” to end the session. A local WebM recording is saved in the browser; click “Download recording” to save it.
- The API will upload the video if `VITE_API_URL` points to a reachable API service.

6. Troubleshooting

- If the camera preview is black, refresh and re‑grant permissions. On Windows/Chrome, ensure camera permission is allowed for `http://localhost:5173`.
- Missing models will show errors in the Issues panel and disable detections until fixed.
- If events don’t appear, verify `apps/web/public/models/yolo-detector.onnx` exists or set `VITE_OBJECT_MODEL_URL`.

## Model Downloads

- Face Landmarker (.task):
  - `@mediapipe/tasks-vision` provides hosted WASM; you need the `.task` model file.
  - Example version path: <https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task>
  - Place at `apps/web/public/models/face_landmarker.task` (or change `VITE_FACE_MODEL_PATH`)
- YOLO ONNX (nano/small, web‑friendly):
  - Any ONNX model that outputs [cx, cy, w, h, obj, class...] rows works with our parser.
  - Suggested: a tiny/nano COCO model converted to ONNX (input 320x320) to keep runtime light.
  - Place at `apps/web/public/models/yolo-detector.onnx` (or set `VITE_OBJECT_MODEL_URL`)

Design notes:

- Object worker uses `onnxruntime-web@wasm` from jsDelivr CDN. Offline usage: host the wasm path and set `env.wasm.wasmPaths` accordingly in `objectWorker.ts`.

## Common Gotcha: Start Button Disabled

The Start button used to wait for ML workers to be READY before enabling — causing it to be disabled if models/CDN were unavailable. We’ve removed that gating. You can now click Start to grant camera access while models continue loading. Any worker errors will show in the Issues panel.

Ensure your model files exist in `apps/web/public/models`. Without them, object detection will be disabled and an error will be shown, but focus detection and recording still work once the face model loads.

## Scripts

- Root
  - `pnpm dev:web` — start Vite dev server
  - `pnpm dev:api` — start API (TSX watch)
  - `pnpm build` — build all packages/apps
  - `pnpm test` — run tests (web unit tests)
  - `pnpm lint` — lint all packages/apps
- Web (`apps/web`)
  - `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm e2e`
- API (`apps/api`)
  - `pnpm dev`, `pnpm build`, `pnpm start`

## Folder Structure

- apps/web: React app (UI, workers, pages)
- apps/api: Express API (sessions, events, uploads, reports)
- packages/types: shared TS types and scoring utils

## Deployment

- Web: Vercel/Netlify (static). Ensure `VITE_API_URL` matches your API URL.
- API: Render/Railway. Supply env vars in dashboard and ensure Mongo (Mongo Atlas, Render Mongo, or external).
  Docker-based deployment has been removed from this repository. Deploy the API to your preferred host (Render/Railway/Fly/Heroku) and Mongo to a managed service (MongoDB Atlas, Render Mongo, etc.).

## Tests & CI

- Unit: scoring utilities (web). Add more tests as needed (focus episode segmentation, API validators).
- E2E: Playwright scaffold (loads the app title).
- CI (GitHub Actions): installs, builds, and runs unit tests.

## Security Notes

- JWT is scaffolded via env but not enforced on routes yet. Add a bearer auth middleware if you need protected endpoints.

## License

No license header included by default. Add if required.
