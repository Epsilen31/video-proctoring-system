import { Router, type RequestHandler } from 'express';
import sessionsRouter from './sessions';
import uploadsRouter from './uploads';
import reportsRouter from './reports';

export const apiRouter: Router = Router();

interface HealthResponse {
  status: 'ok';
  timestamp: number;
}

const healthHandler: RequestHandler = (_req, res) => {
  const payload: HealthResponse = { status: 'ok', timestamp: Date.now() };
  res.json(payload);
};

apiRouter.get('/health', healthHandler);

apiRouter.use('/sessions', sessionsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/reports', reportsRouter);
