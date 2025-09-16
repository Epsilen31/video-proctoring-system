import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env, isDev } from '../config/env';
import { ApiError } from './error-handler';

export interface AuthPayload {
  sub?: string;
  [key: string]: unknown;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== 'string') {
      // In development, allow missing auth to simplify local runs
      if (isDev) return next();
      throw new ApiError('Missing Authorization header', 401);
    }
    const [scheme, token] = header.split(' ');
    const isBearer = typeof scheme === 'string' && /^Bearer$/i.test(scheme);
    if (!isBearer || !token) {
      throw new ApiError('Invalid Authorization header', 401);
    }
    const secret = (env.JWT_SECRET ?? '');
    const decoded = jwt.verify((token) || '', secret) as AuthPayload;
    // attach to request if needed
    (req as any).auth = decoded;
    next();
  } catch (err) {
    if (isDev) return next();
    if (err instanceof ApiError) return next(err);
    return next(new ApiError('Unauthorized', 401));
  }
};
