import http from 'node:http';

import { createApp } from './app';
import { connectDatabase, stopDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

const start = async () => {
  try {
    await connectDatabase();
    const server = http.createServer(app);

    server.listen(env.PORT, () => {
      logger.info(`API listening on port ${env.PORT}`);
    });

    const shutdown = async () => {
      logger.info('Received SIGTERM signal');
      server.close(async () => {
        logger.info('HTTP server closed');
        try {
          await stopDatabase();
        } catch (e) {
          logger.warn('Database shutdown error', e);
        }
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

void start();
