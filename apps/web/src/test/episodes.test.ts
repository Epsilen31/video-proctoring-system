import { describe, expect, it } from 'vitest';
import type { ProctorEvent } from '@focus-proctor/types';
import { segmentEpisodes } from '../lib/episodes';

describe('segmentEpisodes', () => {
  it('segments by cooldown', () => {
    const t = (n: number): number => 1000 + n * 1000;
    const ev = (id: string, ts: number, type: ProctorEvent['type']): ProctorEvent => ({ id, ts, type });
    const events: ProctorEvent[] = [
      ev('1', t(0), 'LookingAway'),
      ev('2', t(1), 'LookingAway'),
      ev('3', t(4), 'LookingAway'), // gap 3s => new episode if cooldownMs <= 1500
      ev('4', t(4), 'NoFace'),
      ev('5', t(6), 'NoFace'), // gap 2s from previous NoFace => same type episode continues
      ev('6', t(10), 'NoFace'), // big gap => new episode
    ];

    const episodes = segmentEpisodes(events, 1500);
    const byType = episodes.reduce<Record<string, number>>((acc, ep) => {
      acc[ep.type] = (acc[ep.type] ?? 0) + 1;
      return acc;
    }, {});

    expect(byType.LookingAway).toBe(2);
    expect(byType.NoFace).toBe(2);
  });
});

