import type { ProctorEvent } from '@focus-proctor/types';

import { formatTimestamp } from '../../../lib/time';

interface EventFeedProps {
  events: ProctorEvent[];
}

const readableEventType: Record<ProctorEvent['type'], string> = {
  LookingAway: 'Looking away',
  NoFace: 'No face detected',
  MultipleFaces: 'Multiple faces',
  PhoneDetected: 'Phone detected',
  NotesDetected: 'Notes detected',
  ExtraDeviceDetected: 'Extra device detected',
};

export const EventFeed = ({ events }: EventFeedProps) => {
  if (!events.length) {
    return (
      <section className="flex flex-col gap-3">
        <header className="flex items-center justify-between text-sm">
          <h3 className="font-semibold text-slate-200">Event feed</h3>
        </header>
        <output className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-xs text-slate-400">
          No proctoring events captured yet. Alerts will appear here in real time with frame
          thumbnails.
        </output>
      </section>
    );
  }

  const sorted = [...events].sort((a, b) => b.ts - a.ts);

  return (
    <section className="flex h-full flex-col gap-3" aria-live="polite" role="log">
      <header className="flex items-center justify-between text-sm">
        <h3 className="font-semibold text-slate-200">Event feed</h3>
        <span className="text-xs text-slate-500">{events.length} events</span>
      </header>
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
        <ul className="divide-y divide-slate-800 text-xs text-slate-200">
          {sorted.map((event) => (
            <li key={event.id} className="flex items-start gap-3 px-4 py-3">
              {event.frameThumb ? (
                <img
                  src={event.frameThumb}
                  alt="Event frame"
                  className="h-16 w-24 flex-shrink-0 rounded border border-slate-800 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded border border-dashed border-slate-700 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
                  No frame
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-100">{readableEventType[event.type]}</p>
                  <time className="font-mono text-[10px] uppercase text-slate-500">
                    {formatTimestamp(event.ts)}
                  </time>
                </div>
                {event.duration ? (
                  <p className="text-[11px] text-slate-400">
                    Duration: {(event.duration / 1000).toFixed(1)}s
                  </p>
                ) : null}
                {event.meta && Object.keys(event.meta).length > 0 && (
                  <pre className="max-h-20 overflow-y-auto rounded bg-slate-900/80 p-2 text-[10px] text-slate-400">
                    {JSON.stringify(event.meta, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
