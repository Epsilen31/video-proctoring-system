import { describe, expect, it } from 'vitest';

import {
  buildIntegrityTimeline,
  computeIntegrityScore,
  countEventsByType,
  type ProctorEvent,
} from '@focus-proctor/types';

describe('scoring utilities', () => {
  it('computes counts and integrity score', () => {
    const events: ProctorEvent[] = [
      { id: '1', ts: 1, type: 'LookingAway' },
      { id: '2', ts: 2, type: 'NoFace' },
      { id: '3', ts: 3, type: 'PhoneDetected' },
    ];
    const counts = countEventsByType(events);
    expect(counts.LookingAway).toBe(1);
    expect(counts.NoFace).toBe(1);
    expect(counts.PhoneDetected).toBe(1);
    const score = computeIntegrityScore(counts);
    // penalty = 5 + 10 + 20 = 35 -> score 65
    expect(score).toBe(65);
  });

  it('builds timeline with decreasing score', () => {
    const startedAt = 1000;
    const endedAt = 4000;
    const events: ProctorEvent[] = [
      { id: '1', ts: 2000, type: 'LookingAway' },
      { id: '2', ts: 3000, type: 'NoFace' },
    ];
    const timeline = buildIntegrityTimeline(events, startedAt, endedAt);
    expect(timeline[0]!.ts).toBe(startedAt);
    expect(timeline.at(-1)?.ts).toBe(endedAt);
    expect(timeline.map((p) => p.score)).toEqual([100, 95, 85, 85]);
  });
});
