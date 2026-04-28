/**
 * Webhook Routes — Meta (Facebook + Instagram)
 * Recebe eventos de engajamento em tempo real do Meta via Webhooks v19+
 *
 * Endpoints:
 *   GET  /webhooks/meta  → Webhook verification (Meta challenge)
 *   POST /webhooks/meta  → Process engagement events
 *
 * Setup no Meta Business Suite:
 *   Webhook URL: https://dispatcher.piranot.com.br/api/webhooks/meta
 *   Verify Token: config.META_WEBHOOK_VERIFY_TOKEN
 *   Subscriptions: feed (comments, likes, shares) + instagram (comments, mentions)
 */

import { Hono } from 'hono';
import { logger } from '../lib/logger';
import { config } from '../config';
import { engagementAggregator } from '../engagement/aggregator';

export const webhookRouter = new Hono();

/**
 * GET /webhooks/meta — Webhook verification (Meta challenge)
 * Meta sends hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=xxx
 */
webhookRouter.get('/webhooks/meta', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  logger.info({ mode, tokenProvided: !!token }, 'Meta webhook verification request');

  if (!mode || !token) {
    return c.text('Missing parameters', 400);
  }

  const verifyToken = config.META_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    logger.error({}, 'META_WEBHOOK_VERIFY_TOKEN not configured');
    return c.text('Webhook verify token not configured', 500);
  }

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info({ challenge }, 'Meta webhook verified successfully');
    return c.text(challenge || '', 200);
  }

  logger.warn({ expectedToken: verifyToken.substring(0, 4) + '...', receivedToken: token.substring(0, 4) + '...' },
    'Meta webhook verification: token mismatch');
  return c.text('Verification failed', 403);
});

/**
 * POST /webhooks/meta — Process engagement events
 * Meta sends JSON payload with entry[] of events
 */
webhookRouter.post('/webhooks/meta', async (c) => {
  try {
    const body = await c.req.json();

    // Validate it's from Meta (basic structure check)
    if (!body.object || !['instagram', 'page'].includes(body.object)) {
      logger.warn({ object: body.object }, 'Invalid webhook: unrecognized object type');
      return c.json({ error: 'Invalid object type' }, 400);
    }

    if (!body.entry || !Array.isArray(body.entry)) {
      logger.warn({ body }, 'Invalid webhook: missing entry array');
      return c.json({ error: 'Missing entry array' }, 400);
    }

    logger.info({ object: body.object, entries: body.entry.length }, 'Meta webhook received');

    // Process via engagement aggregator
    const events = await engagementAggregator.processWebhook(body);

    return c.json({
      success: true,
      eventsProcessed: events.length,
    }, 200);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Meta webhook processing error');

    // Always return 200 to Meta (they will retry otherwise)
    return c.json({ error: 'Processing error' }, 200);
  }
});
