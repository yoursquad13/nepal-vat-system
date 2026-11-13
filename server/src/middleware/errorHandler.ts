import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/errors.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      issues: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Postgres unique constraint violation
  if (err?.code === '23505') {
    res.status(409).json({
      error: 'Duplicate record exists',
      detail: err.detail,
    });
    return;
  }

  // Postgres foreign key violation
  if (err?.code === '23503') {
    res.status(400).json({
      error: 'Referenced record not found',
      detail: err.detail,
    });
    return;
  }

  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled server error:', err);
  }

  res.status(500).json({
    error: 'Internal server error',
    ...(env.NODE_ENV !== 'production' ? { details: err?.message || String(err) } : {}),
  });
}
