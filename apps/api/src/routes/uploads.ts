import { Router, type Router as RouterType } from 'express';
import multer from 'multer';

import { requireAuth } from '../middlewares/auth';
import { UploadModel } from '../models/upload';
import { SessionModel } from '../models/session';

const router: RouterType = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 200 } });

router.post('/video', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const sessionId = req.body.sessionId as string | undefined;
    if (!sessionId) {
      res.status(400).json({ message: 'sessionId is required' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    const base64 = file.buffer.toString('base64');
    const url = `data:${file.mimetype};base64,${base64}`;
    const uploadDoc = await UploadModel.create({
      sessionId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url,
      storage: 'dataurl',
    });

    await SessionModel.updateOne(
      { _id: sessionId },
      { $set: { videoRef: { url, bytes: file.size } } },
    );

    res.status(201).json({ url, id: uploadDoc._id.toString() });
  } catch (err) {
    next(err);
  }
});

export default router;
