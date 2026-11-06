import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { logger } from './utils/logger';

const server = createApp().listen(env.PORT, () => {
  logger.info(`Smart Tuition API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received - shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
