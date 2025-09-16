import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middlewares/auth';
import { SessionModel } from '../models/session';

const router: RouterType = Router();

const createSessionSchema = z.object({
  candidateName: z.string().min(1),
  candidateId: z.string().optional(),
});

const eventTypeSchema = z.enum([
  'LookingAway',
  'NoFace',
  'MultipleFaces',
  'PhoneDetected',
  'NotesDetected',
  'ExtraDeviceDetected',
]);

const proctorEventSchema = z.object({
  id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  type: eventTypeSchema,
  duration: z.number().int().nonnegative().optional(),
  meta: z.unknown().optional(),
  frameThumb: z.string().url().optional(),
});

const appendEventsSchema = z.object({ events: z.array(proctorEventSchema).min(1) });

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = createSessionSchema.parse(req.body);
    const doc = await SessionModel.create({
      candidateName: body.candidateName,
      candidateId: body.candidateId,
      startedAt: Date.now(),
    });
    res.status(201).json({ _id: doc._id.toString() });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/end', requireAuth, async (req, res, next) => {
  try {
    await SessionModel.updateOne({ _id: req.params.id }, { $set: { endedAt: Date.now() } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const session = await SessionModel.findById(req.params.id).lean();
    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/events', requireAuth, async (req, res, next) => {
  try {
    const body = appendEventsSchema.parse(req.body);
    await SessionModel.updateOne(
      { _id: req.params.id },
      { $push: { events: { $each: body.events } } },
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
