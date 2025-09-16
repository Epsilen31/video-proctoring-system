import { clsx } from 'clsx';
import { useMemo } from 'react';

import { formatBytes } from '../../../lib/time';
import type { FocusState } from '../../../types/session';
import { StatusChip } from '../../../components/StatusChip';

interface ControlsPanelProps {
  onStart: () => void;
  onStop: () => void;
  isRunning: boolean;
  isLoading: boolean;
  isStopping: boolean;
  focusState: FocusState;
  fps: number;
  avgFps: number;
  recordingBytes?: number;
  onDownload?: () => Promise<void> | void;
  recordingReady: boolean;
  errors?: string[];
}

const focusChipConfig: { label: string; tone: FocusState }[] = [
  { label: 'Focused', tone: 'focused' },
  { label: 'Warning', tone: 'warning' },
  { label: 'Alert', tone: 'alert' },
];

export const ControlsPanel = ({
  onStart,
  onStop,
  isRunning,
  isLoading,
  isStopping,
  focusState,
  fps,
  avgFps,
  recordingBytes,
  onDownload,
  recordingReady,
  errors,
}: ControlsPanelProps) => {
  const metrics = useMemo(
    () => [
      { label: 'Current FPS', value: fps ? fps.toFixed(1) : '--' },
      { label: 'Average FPS', value: avgFps ? avgFps.toFixed(1) : '--' },
      recordingBytes
        ? { label: 'Recording size', value: formatBytes(recordingBytes) }
        : { label: 'Recording size', value: recordingReady ? 'Ready' : '--' },
    ],
    [avgFps, fps, recordingBytes, recordingReady],
  );

  return (
    <aside className="flex h-full flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950 p-6">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Session controls</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onStart}
            disabled={isLoading || isRunning}
            className={clsx(
              'inline-flex flex-1 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950',
              'border-focus-success/60 bg-focus-success/10 text-focus-success hover:bg-focus-success/20',
              (isLoading || isRunning) && 'opacity-60',
            )}
          >
            {isLoading ? 'Please allow camera' : 'Start session'}
          </button>
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            disabled={!isRunning || isStopping}
            aria-label="Stop session"
          >
            {isStopping ? 'Stopping...' : 'Stop'}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Grant camera access when prompted. Recording stays in your browser until you choose to
          upload it.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-200">Focus status</h3>
        <div className="flex flex-wrap gap-2">
          {focusChipConfig.map(({ label, tone }) => (
            <StatusChip key={tone} label={label} tone={tone} active={tone === focusState} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 text-sm">
        <h3 className="text-sm font-semibold text-slate-200">Live metrics</h3>
        <dl className="grid grid-cols-1 gap-2 text-xs text-slate-400">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2"
            >
              <dt>{metric.label}</dt>
              <dd className="font-mono text-slate-100">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-auto flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Recording state</p>
          <span
            className={clsx(
              'text-xs font-semibold',
              recordingReady ? 'text-focus-success' : 'text-slate-500',
            )}
          >
            {recordingReady ? 'Saved locally' : 'Not captured'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onDownload?.()}
          disabled={!recordingReady}
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Download recording
        </button>
        {errors && errors.length > 0 && (
          <div className="rounded border border-focus-danger/50 bg-focus-danger/10 p-3 text-xs text-focus-danger">
            <p className="font-semibold">Issues</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </aside>
  );
};
