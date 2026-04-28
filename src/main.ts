/**
 * Main entry point
 * P0 #10: Process signal handlers for graceful shutdown
 */

import { serve } from '@hono/node-server';
import { start } from './server.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { realtimeServer } from './dashboard/realtime-server.js';

const main = async () => {
  const app = await start();

  const httpServer = serve(
    {
      fetch: app.fetch,
      port: config.PORT,
    },
    (info) => {
      logger.info({ port: info.port }, 'Social Dispatcher running');

      // Attach WebSocket server to the same HTTP server
      realtimeServer.start(httpServer as any);
    }
  );

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
    
    // Close WebSocket server first
    await realtimeServer.stop();
    
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit if not closed within 10s
    setTimeout(() => {
      logger.error('Could not close connections in time, forceful shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason, promise) => {
    const errMsg = reason instanceof Error ? reason.message : String(reason);
    logger.error({ error: errMsg }, 'Unhandled promise rejection');
    // Don't exit on unhandled rejection, just log
  });
};

main().catch((err) => {
  logger.error({ error: err.message }, 'Fatal error');
  process.exit(1);
});
