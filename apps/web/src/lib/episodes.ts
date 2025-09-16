import type { ProctorEvent } from '@focus-proctor/types';

export interface Episode {
  type: ProctorEvent['type'];
  startedAt: number;
  endedAt: number;
}

// Groups events into episodes: contiguous events of the same type separated by >= cooldownMs start a new episode
export const segmentEpisodes = (events: ProctorEvent[], cooldownMs: number): Episode[] => {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const out: Episode[] = [];
  const lastByType = new Map<ProctorEvent['type'], Episode>();

  for (const ev of sorted) {
    const last = lastByType.get(ev.type);
    if (!last) {
      const ep: Episode = { type: ev.type, startedAt: ev.ts, endedAt: ev.ts };
      lastByType.set(ev.type, ep);
      out.push(ep);
      continue;
    }
    if (ev.ts - last.endedAt >= cooldownMs) {
      const ep: Episode = { type: ev.type, startedAt: ev.ts, endedAt: ev.ts };
      lastByType.set(ev.type, ep);
      out.push(ep);
    } else {
      last.endedAt = ev.ts;
    }
  }
  return out;
};

