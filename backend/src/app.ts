import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { pool } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import adminRoutes from './modules/admin/admin.routes';
import applicationRoutes from './modules/applications/applications.routes';
import authRoutes from './modules/auth/auth.routes';
import metaRoutes from './modules/meta/meta.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import parentRoutes from './modules/parents/parents.routes';
import requirementRoutes from './modules/requirements/requirements.routes';
import tutorRoutes from './modules/tutors/tutors.routes';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'database unavailable' });
    }
  });

  // Profile photos are public by design; everything else in storage is served through authorised routes.
  app.use(
    '/api/v1/files/photos',
    express.static(path.resolve(env.UPLOAD_DIR, 'photos'), {
      index: false,
      dotfiles: 'deny',
      maxAge: '7d',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/meta', metaRoutes);
  api.use('/parents', parentRoutes);
  api.use('/tutors', tutorRoutes);
  api.use('/requirements', requirementRoutes);
  api.use('/applications', applicationRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/admin', adminRoutes);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
