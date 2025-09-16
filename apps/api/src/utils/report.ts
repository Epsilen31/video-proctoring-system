export const computeIntegrityScore = (c: Record<string, number>) => {
  const penalty =
    5 * (c.LookingAway ?? 0) +
    10 * (c.NoFace ?? 0) +
    15 * (c.MultipleFaces ?? 0) +
    20 * (c.PhoneDetected ?? 0) +
    10 * (c.NotesDetected ?? 0) +
    15 * (c.ExtraDeviceDetected ?? 0);
  return Math.max(0, Math.min(100, 100 - penalty));
};

export const buildIntegrityTimeline = (
  events: { ts: number; type: string }[],
  startedAt: number,
  endedAt: number,
) => {
  const points: { ts: number; score: number }[] = [];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const running: Record<string, number> = {
    LookingAway: 0,
    NoFace: 0,
    MultipleFaces: 0,
    PhoneDetected: 0,
    NotesDetected: 0,
    ExtraDeviceDetected: 0,
  };
  points.push({ ts: startedAt, score: 100 });
  for (const ev of sorted) {
    running[ev.type] = (running[ev.type] ?? 0) + 1;
    points.push({ ts: ev.ts, score: computeIntegrityScore(running) });
  }
  points.push({ ts: endedAt, score: computeIntegrityScore(running) });
  return points;
};

