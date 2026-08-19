import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body.' },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      req.log.error({ err, details: err.details }, err.message);
    } else {
      req.log.warn({ details: err.details }, err.message);
    }
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  req.log.error({ err }, 'Unexpected error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}
