import { forwardRef, type RefObject } from 'react';

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  isActive: boolean;
  isLoading: boolean;
  streamError?: string | null;
}

export const CameraStage = forwardRef<HTMLDivElement, CameraStageProps>(
  ({ videoRef, canvasRef, isActive, isLoading, streamError }, ref) => {
    return (
      <div
        ref={ref}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          aria-label="Candidate camera feed"
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
          tabIndex={-1}
        />
        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
            <div className="text-sm font-medium text-slate-100">Camera is idle</div>
            <p className="max-w-xs text-center text-xs text-slate-400">
              {isLoading
                ? 'Requesting access to your camera...'
                : 'Click start to grant camera access and begin the interview session.'}
            </p>
          </div>
        )}
        {streamError && (
          <div className="absolute inset-x-0 bottom-0 bg-focus-danger/90 p-3 text-center text-xs font-medium text-white">
            {streamError}
          </div>
        )}
      </div>
    );
  },
);

CameraStage.displayName = 'CameraStage';
