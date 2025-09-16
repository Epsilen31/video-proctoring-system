import type { NextFunction, Request, Response } from 'express';

type AsyncHandler<Params extends Request = Request> = (
  req: Params,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const asyncHandler = <Params extends Request>(handler: AsyncHandler<Params>) =>
  (req: Params, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
