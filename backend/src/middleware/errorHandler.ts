import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface PgError {
  code?: string;
  constraint?: string;
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } });
  }
  const pg = err as PgError;
  if (pg?.code === '23505') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'This record already exists' } });
  }
  if (pg?.code === '23503') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Referenced record does not exist' } });
  }
  if (pg?.code === '22P02') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid identifier format' } });
  }
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}
