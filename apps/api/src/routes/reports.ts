import { Router, type Router as RouterType } from 'express';

import { SessionModel } from '../models/session';
import { buildIntegrityTimeline, computeIntegrityScore } from '../utils/report';

const router: RouterType = Router();

router.get('/:id', async (req, res, next) => {
  try {
    const session = await SessionModel.findById(req.params.id).lean();
    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    const start = session.startedAt;
    const end = session.endedAt ?? Date.now();
    const durationMs = Math.max(0, end - start);

    const counts: Record<string, number> = {
      LookingAway: 0,
      NoFace: 0,
      MultipleFaces: 0,
      PhoneDetected: 0,
      NotesDetected: 0,
      ExtraDeviceDetected: 0,
    };
    if (Array.isArray(session.events)) {
      for (const ev of session.events as { type: string }[]) {
        const current = counts[ev.type] ?? 0;
        counts[ev.type] = current + 1;
      }
    }
    const integrityScore = computeIntegrityScore(counts as any);
    const timeline = buildIntegrityTimeline(
      (session.events as any[]) ?? [],
      session.startedAt,
      session.endedAt ?? Date.now(),
    );

    res.json({
      sessionId: req.params.id,
      integrityScore,
      countsByType: counts,
      durationMs,
      timeline,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
