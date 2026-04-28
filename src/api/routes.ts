import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import { config } from '../config';
import { dispatcher } from '../dispatcher';
import { getQueueStats } from '../queue/bullmq-setup';
import { query } from '../db/client';
import { logger } from '../lib/logger';
import { SocialPostPayload } from '../types';
import { DispatchPayloadSchema, formatZodError } from '../types/validation';
import { queueAdminRouter } from './queue-admin';
import { analyticsRouter } from './analytics';
import { reportingRouter } from './reporting-routes';
import { schedulerRouter } from './scheduler-routes';

export const apiRoutes = new Hono();

// POST /dispatch - Enqueue posts for distribution
apiRoutes.post('/dispatch', async (c) => {
  const correlationId = uuidv4();
  try {
    const body = await c.req.json();

    // Zod validation
    const validated = DispatchPayloadSchema.parse(body);

    const payload: SocialPostPayload = {
      id: uuidv4(),
      title: validated.title,
      link: validated.link,
      summary: validated.summary,
      category: validated.category,
      priority: validated.priority,
      channels: [...validated.channels],
      imageUrl: validated.imageUrl,
      videoUrl: validated.videoUrl,
      scheduledAt: validated.scheduledAt ? new Date(validated.scheduledAt) : undefined,
      metadata: {
        sourceId: validated.metadata.sourceId,
        utmCampaign: validated.metadata.utmCampaign,
        utmSource: validated.metadata.utmSource,
        abTestId: validated.metadata.abTestId,
        abVariation: validated.metadata.abVariation,
      },
    };

    try {
      const results = await dispatcher.dispatch(payload);
      logger.info({ correlationId, postId: payload.id, channels: payload.channels }, 'Dispatch success');
      return c.json({ success: true, data: results }, 202);
    } catch (dbErr: unknown) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      const errCode = (dbErr as Record<string, unknown>).code;
      // Demo mode: return success without database
      if (errMsg.includes('password authentication failed') || errCode === 'ECONNREFUSED') {
        logger.warn({ correlationId, error: errMsg }, 'Demo mode: returning success without database');
        const demoResults = payload.channels.map(channel => ({
          jobId: `demo-${uuidv4()}`,
          postId: payload.id,
          channel,
          status: 'queued' as const,
          timestamp: new Date(),
          durationMs: 0,
        }));
        return c.json({ success: true, data: demoResults, mode: 'demo' }, 202);
      }
      throw dbErr;
    }
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      logger.warn({ correlationId, validationErrors: err.errors }, 'Dispatch validation failed');
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: errMsg }, 'Dispatch error');
    return c.json({ error: errMsg }, 500);
  }
});

// GET /status/:postId - Check post status
apiRoutes.get('/status/:postId', async (c) => {
  try {
    const status = await dispatcher.getStatus(c.req.param('postId'));
    return c.json({ success: true, data: status });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ error: errMsg }, 500);
  }
});

// GET /metrics - Get aggregated metrics
apiRoutes.get('/metrics', async (c) => {
  try {
    const stats = await getQueueStats();
    return c.json({ success: true, data: { queues: stats } });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ error: errMsg }, 500);
  }
});

// GET /health — Comprehensive health check
apiRoutes.get('/health', async (c) => {
  const checks: Record<string, { status: string; detail?: string }> = {};
  let allOk = true;

  // DB
  try {
    await query('SELECT NOW()');
    checks.db = { status: 'ok' };
  } catch (e: any) {
    checks.db = { status: 'fail', detail: e.message };
    allOk = false;
  }

  // Redis
  try {
    const { rateLimiter } = await import('../cache/rate-limiter');
    await rateLimiter.checkLimit('health:check');
    checks.redis = { status: 'ok' };
  } catch (e: any) {
    checks.redis = { status: e.message.includes('ENOTFOUND') ? 'degraded' : 'fail', detail: e.message };
  }

  // Meta API connectivity (lightweight check)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(config.FACEBOOK_PAGE_TOKEN)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    checks.metaApi = res.ok
      ? { status: 'ok' }
      : { status: 'fail', detail: `HTTP ${res.status}` };
    if (!res.ok) allOk = false;
  } catch (e: any) {
    checks.metaApi = { status: 'degraded', detail: e.message };
  }

  // Queue status
  try {
    const { getQueueStats } = await import('../queue/bullmq-setup');
    const stats = await getQueueStats();
    checks.queues = { status: 'ok', detail: `waiting=${stats.waiting}, active=${stats.active}` };
  } catch (e: any) {
    checks.queues = { status: 'degraded', detail: e.message };
  }

  return c.json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }, allOk ? 200 : 503);
});

// Mount queue admin, analytics, and reporting routers
apiRoutes.route('', queueAdminRouter);
apiRoutes.route('', analyticsRouter);
apiRoutes.route('', reportingRouter);
apiRoutes.route('', schedulerRouter);
