/**
 * Queue Admin API
 * Endpoints para gerenciar fila e repriorização manual
 * P0 #8: Zod validation
 * P0 #9: Auth middleware em endpoints sensíveis
 */

import { Hono } from 'hono';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { queueStateManager } from '../queue/queue-state';
import { SocialChannel } from '../types';
import { createAuthMiddleware } from './middleware/auth';
import {
  ReprioritizeRequestSchema,
  AnalyzeRequestSchema,
  QueueQuerySchema,
  formatZodError,
} from '../types/validation';

export const queueAdminRouter = new Hono();

// Auth middleware for admin endpoints
const authMiddleware = createAuthMiddleware();
const adminAuth = createAuthMiddleware('admin');

/**
 * GET /queue?channel=instagram
 * Listar itens da fila por channel
 * Protected: requires valid API token
 */
queueAdminRouter.get('/queue', authMiddleware, async (c) => {
  try {
    const { channel } = QueueQuerySchema.parse({ channel: c.req.query('channel') });

    const queueItems = await queueStateManager.getQueueState(channel);

    return c.json({
      channel,
      count: queueItems.length,
      items: queueItems,
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Queue list error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /queue/stats
 * Obter estatísticas gerais de todas as filas
 * Public: no auth required
 */
queueAdminRouter.get('/queue/stats', async (c) => {
  try {
    const stats = await queueStateManager.getAllQueueStats();

    return c.json({
      timestamp: new Date().toISOString(),
      queues: stats,
      total: Object.values(stats).reduce((a: number, b: number) => a + b, 0),
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Queue stats error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * POST /queue/reprioritize
 * Reprioritizar um post manualmente
 * Protected: requires valid API token
 */
queueAdminRouter.post('/queue/reprioritize', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();

    // Zod validation (includes past-date check)
    const validated = ReprioritizeRequestSchema.parse(body);

    const scheduled = new Date(validated.newScheduledAt);

    // Obter item atual
    const currentItem = await queueStateManager.getQueueItem(validated.postId);
    if (!currentItem) {
      return c.json({ error: `Post ${validated.postId} not found in queue` }, 404);
    }

    // Validate and apply editor override
    try {
      // Basic validation (replaces operator.validateEditorInput)
      if (scheduled < new Date()) {
        return c.json({ error: 'Cannot schedule in the past' }, 400);
      }
      const maxFuture = new Date(Date.now() + 7 * 86400000);
      if (scheduled > maxFuture) {
        return c.json({ error: 'Cannot schedule more than 7 days ahead' }, 400);
      }

      const updated = await queueStateManager.reprioritizeItem(
        validated.postId,
        scheduled,
        currentItem.version
      );

      logger.info(
        {
          postId: validated.postId,
          oldScheduledAt: currentItem.scheduledAt,
          newScheduledAt: scheduled,
          reason: validated.reason,
        },
        'Editor override applied'
      );

      return c.json({
        success: true,
        message: 'Post reprioritizado',
        queueItem: updated,
      });
    } catch (orchestrateErr: unknown) {
      const errMsg = orchestrateErr instanceof Error ? orchestrateErr.message : String(orchestrateErr);
      return c.json({ error: `Reprioritization failed: ${errMsg}` }, 400);
    }
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Reprioritization error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * POST /queue/analyze
 * Analisar fila e gerar recomendações de repriorização
 * Protected: requires valid API token
 */
queueAdminRouter.post('/queue/analyze', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { channel } = AnalyzeRequestSchema.parse(body);

    // Obter top items
    const topItems = await queueStateManager.getTopItems(channel, 5);

    if (topItems.length === 0) {
      return c.json({
        channel,
        message: 'Queue is empty',
        recommendations: [],
      });
    }

    // Generate basic recommendations (replaces orchestrator.orchestrateReprioritization)
    const recommendations = [];
    for (const item of topItems) {
      const timeWaiting = Date.now() - item.scheduledAt.getTime();
      const minutesWaiting = Math.floor(timeWaiting / 60000);
      
      // Simple heuristic: if waiting > 60min, suggest reprioritization
      const shouldReprioritize = minutesWaiting > 60 || item.reprioritizedCount > 3;
      
      recommendations.push({
        postId: item.postId,
        currentPosition: item.queuePosition,
        suggestedAction: shouldReprioritize ? 'reprioritize' : 'keep',
        minutesWaiting,
        reprioritizedCount: item.reprioritizedCount,
      });
    }

    return c.json({
      channel,
      timestamp: new Date().toISOString(),
      topItems: topItems.length,
      recommendations,
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Queue analysis error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /queue/:postId
 * Obter item específico da fila
 * Public: no auth required (status check)
 */
queueAdminRouter.get('/queue/:postId', async (c) => {
  try {
    const postId = c.req.param('postId');

    const item = await queueStateManager.getQueueItem(postId);
    if (!item) {
      return c.json({ error: `Post ${postId} not found in queue` }, 404);
    }

    return c.json({
      success: true,
      item,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, postId: c.req.param('postId') }, 'Get item error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * DELETE /queue/:postId
 * Remover item da fila (ex: após publicação)
 * Protected: requires admin role
 */
queueAdminRouter.delete('/queue/:postId', adminAuth, async (c) => {
  try {
    const postId = c.req.param('postId') as string;

    const item = await queueStateManager.getQueueItem(postId);
    if (!item) {
      return c.json({ error: `Post ${postId} not found in queue` }, 404);
    }

    await queueStateManager.removeFromQueue(postId as string);

    logger.info({ postId }, 'Item removed from queue');

    return c.json({
      success: true,
      message: `Post ${postId} removed from queue`,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, postId: c.req.param('postId') }, 'Delete error');
    return c.json({ error: errMsg }, 500);
  }
});
