/**
 * Reporting API Routes
 * Endpoints para disparo manual e status dos relatórios
 */

import { Hono } from 'hono';
import { logger } from '../lib/logger';
import { triggerReport, getSchedulerStatus } from '../reporting/scheduler';
import { testEmailConnection } from '../reporting/email-sender';
import { getLearningState, auditBias, recomputeTimingPatterns, getBestTiming } from '../memory/manager';
import { getEnabledPlatforms, validatePlatformCredentials } from '../config/platforms';

export const reportingRouter = new Hono();

// GET /reports/status — Status dos schedulers de relatório
reportingRouter.get('/reports/status', async (c) => {
  try {
    const schedulers = getSchedulerStatus();
    const emailOk = await testEmailConnection();

    return c.json({
      success: true,
      data: {
        emailConnection: emailOk ? 'connected' : 'disconnected',
        schedulers,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Reports status check failed');
    return c.json({ error: errMsg }, 500);
  }
});

// POST /reports/trigger — Disparar relatório manualmente
reportingRouter.post('/reports/trigger', async (c) => {
  try {
    const body = await c.req.json();
    const type = body.type as 'daily' | 'weekly' | 'monthly';

    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return c.json({ error: 'Invalid report type. Use: daily, weekly, monthly' }, 400);
    }

    const date = body.date ? new Date(body.date) : undefined;
    const success = await triggerReport(type, date);

    return c.json({
      success,
      message: success ? `${type} report sent` : `${type} report failed - check logs`,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Report trigger failed');
    return c.json({ error: errMsg }, 500);
  }
});

// GET /memory/status — Estado da memória evolutiva
reportingRouter.get('/memory/status', async (c) => {
  try {
    const learningState = await getLearningState();
    return c.json({ success: true, data: learningState });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ error: errMsg }, 500);
  }
});

// GET /memory/audit — Auditoria de bias
reportingRouter.get('/memory/audit', async (c) => {
  try {
    const audit = await auditBias();
    return c.json({ success: true, data: audit });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ error: errMsg }, 500);
  }
});

// POST /memory/retrain — Forçar retrain dos patterns
reportingRouter.post('/memory/retrain', async (c) => {
  try {
    const patternsUpdated = await recomputeTimingPatterns();
    return c.json({
      success: true,
      data: { patternsUpdated },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ error: errMsg }, 500);
  }
});

// GET /memory/timing/:category/:platform — Melhor timing para categoria/plataforma
reportingRouter.get('/memory/timing/:category/:platform', async (c) => {
  try {
    const category = c.req.param('category');
    const platform = c.req.param('platform');
    const timing = await getBestTiming(category, platform);

    if (!timing) {
      return c.json({
        success: true,
        data: null,
        message: 'No timing data available yet. Need more historical data.',
      });
    }

    return c.json({ success: true, data: timing });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ error: errMsg }, 500);
  }
});

// GET /platforms/status — Status das plataformas configuradas
reportingRouter.get('/platforms/status', async (c) => {
  try {
    const enabled = getEnabledPlatforms();
    const credentials = validatePlatformCredentials();

    return c.json({
      success: true,
      data: {
        enabledPlatforms: enabled,
        credentialsStatus: credentials,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ error: errMsg }, 500);
  }
});
