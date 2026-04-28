import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from './lib/logger';
import { config, validateConfig } from './config';
import { apiRoutes } from './api/routes';
import { setupQueueListeners } from './queue/bullmq-setup';
import { health as dbHealth } from './db/client';
import { createAuthMiddleware } from './api/middleware/auth';
import { initReportScheduler, stopReportScheduler } from './reporting/scheduler';
import { initMemoryTables } from './memory/manager';
import { initMemoryScheduler, stopMemoryScheduler } from './memory/scheduler';
import { initRampUp } from './revival/ramp-up';
import { platformConfigs } from './config/platforms';
import { webhookRouter } from './api/webhook-routes';
import { engagementAggregator } from './engagement/aggregator';
import { bayesianOptimizer } from './ml/bayesian-optimizer';
import { socialDaemon } from './daemon/scheduler';

const app = new Hono();

// CORS Configuration (SAFE: explicit allowed origins)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://piranot.com.br,https://editor.piranot.com.br').split(',');

// Middleware
app.use('*', cors({
  origin: allowedOrigins,
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Token', 'X-User-Role'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400
}));

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, durationMs: duration });
});

// Auth middleware for /dispatch endpoint (P0 #9: centralized auth)
app.use('/api/dispatch', createAuthMiddleware());

// Routes
app.route('/api', apiRoutes);
app.route('/api', webhookRouter); // Meta webhooks (GET verify + POST events)

// Serve static dashboard (public/)
app.use('/dashboard.html', serveStatic({ path: './public/dashboard.html' }));
app.use('/public/*', serveStatic({ root: './' }));
app.get('/', (c) => c.redirect('/dashboard.html'));

// Inline SVG favicon
app.get('/favicon.ico', (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1e293b"/><text x="16" y="23" text-anchor="middle" font-size="20" fill="#38bdf8">S</text></svg>`;
  c.header('Content-Type', 'image/svg+xml');
  c.header('Cache-Control', 'public, max-age=604800');
  return c.body(svg);
});

// Startup
export async function start() {
  validateConfig();

  try {
    // Check DB
    const dbHealthy = await dbHealth();
    if (!dbHealthy) {
      logger.warn({}, 'Database not reachable - continuing in demo mode');
    }

    // Setup queues (optional - only if Redis is available)
    try {
      await setupQueueListeners();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Could not setup queues - continuing without job processing');
    }

    // Initialize memory tables and scheduler
    try {
      await initMemoryTables();
      await initMemoryScheduler();
      logger.info({}, 'Memory system initialized');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Could not initialize memory system - continuing without learning');
    }

    // Initialize report scheduler
    try {
      await initReportScheduler();
      logger.info({}, 'Report scheduler initialized');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Could not initialize report scheduler - continuing without auto-reports');
    }

    // Initialize ramp-up engine (dormant page revival)
    try {
      await initRampUp();
      logger.info({}, 'Ramp-up engine initialized');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Could not initialize ramp-up engine — continuing without');
    }

    // Initialize Bayesian optimizer (ML timing engine)
    try {
      await bayesianOptimizer.init();
      logger.info({}, 'Bayesian optimizer initialized');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Could not initialize Bayesian optimizer — continuing without ML timing');
    }

    // Start BullMQ workers — Facebook + Instagram only (active platforms)
    try {
      const { facebookWorker } = await import('./workers/facebook.worker');
      const workers = ['facebook'];
      if (platformConfigs.instagram.enabled) {
        const { instagramWorker } = await import('./workers/instagram.worker');
        workers.push('instagram');
      }
      logger.info({}, `Workers started: ${workers.join(', ')}`);
      logger.info({}, 'Idle workers (whatsapp, twitter, linkedin, tiktok) — disabled until needed');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Could not start workers — jobs will queue but not process');
    }

    logger.info({ port: config.PORT }, 'Starting Social Dispatcher');

    // Start the 24/7 daemon (article curator + health monitors)
    try {
      await socialDaemon.start();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Could not start social daemon — continuing without autonomous cycles');
    }

    return app;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Startup error');
    process.exit(1);
  }
}

export default app;
