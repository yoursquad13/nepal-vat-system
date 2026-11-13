import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { settingsRouter } from './routes/settings.js';
import { auditLogsRouter } from './routes/auditLogs.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './utils/errors.js';

export function createApp(): Express {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows flexible static asset loading for SPA if needed
    })
  );

  // CORS support
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Parsers with 10mb body limit
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/audit-logs', auditLogsRouter);

  // Catch-all 404 for unmatched /api routes
  app.all('/api/*', (_req, _res, next) => {
    next(ApiError.notFound('API endpoint not found'));
  });

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
