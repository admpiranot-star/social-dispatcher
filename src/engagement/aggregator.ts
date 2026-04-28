/**
 * Engagement Aggregator
 * Processa webhooks do Meta (Instagram, Facebook) em tempo real
 * Deduplicação + armazenamento em DB + cache Redis para análises
 */

import { query } from '../db/client';
import { logger } from '../lib/logger';
import Redis from 'ioredis';
import { EngagementEvent } from '../types';

export class EngagementAggregator {
  private redis: Redis;
  private deduplicationWindow = 3600000; // 1 hora para dedup

  constructor(redisUrl?: string) {
    // Use env REDIS_URL or config, with auth support
    const url = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    this.redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  }

  /**
   * Processar webhook do Meta
   * Formato esperado (Meta Webhook v19.0):
   * {
   *   "object": "instagram" ou "page",
   *   "entry": [{
   *     "id": "page_id",
   *     "time": timestamp,
   *     "changes": [{
   *       "value": {
   *         "media_id": "...",
   *         "caption": "...",
   *         "comments_count": 5,
   *         "like_count": 234,
   *         "shares_count": 12
   *       },
   *       "field": "comments" | "likes" | "media"
   *     }]
   *   }]
   * }
   */
  async processWebhook(webhook: any): Promise<EngagementEvent[]> {
    const events: EngagementEvent[] = [];

    try {
      if (!webhook.entry || !Array.isArray(webhook.entry)) {
        logger.warn({ webhook }, 'Webhook inválido: sem entry');
        return [];
      }

      for (const entry of webhook.entry) {
        if (!entry.changes) continue;

        for (const change of entry.changes) {
          try {
            const event = await this.parseAndStoreEvent(change, entry);
            if (event) {
              events.push(event);
            }
          } catch (changeErr: any) {
            logger.warn({ error: changeErr.message, change }, 'Erro ao processar mudança');
          }
        }
      }

      logger.info({ totalEvents: events.length, entry: webhook.object }, 'Webhook processado');
      return events;
    } catch (err: any) {
      logger.error({ error: err.message, webhook }, 'Erro ao processar webhook');
      throw err;
    }
  }

  /**
   * Parsear event do Meta e armazenar no BD + cache
   */
  private async parseAndStoreEvent(change: any, entry: any): Promise<EngagementEvent | null> {
    const value = change.value;
    if (!value || !value.media_id) return null;

    // Determinar tipo de evento baseado no field
    let eventType: 'like' | 'comment' | 'share' | 'impression' | 'click' = 'impression';
    let metricValue = 1;

    if (change.field === 'likes' && value.like_count) {
      eventType = 'like';
      metricValue = value.like_count;
    } else if (change.field === 'comments' && value.comments_count) {
      eventType = 'comment';
      metricValue = value.comments_count;
    } else if (change.field === 'shares' && value.shares_count) {
      eventType = 'share';
      metricValue = value.shares_count;
    }

    // Gerar ID de deduplicação
    const eventExternalId = `${entry.id}-${value.media_id}-${change.field}-${entry.time}`;

    // Checar se já foi processado (deduplicação)
    const deduplicationKey = `engagement:dedup:${eventExternalId}`;
    const alreadyProcessed = await this.redis.get(deduplicationKey);

    if (alreadyProcessed) {
      logger.debug({ eventExternalId }, 'Evento duplicado ignorado');
      return null;
    }

    // Armazenar no banco
    const result = await query(
      `
      INSERT INTO engagement_events (
        post_id, social_account_id, event_type, event_external_id,
        metric_value, metadata, received_at, processed_at
      ) VALUES (
        (SELECT id FROM posts WHERE platform_post_id = $1 LIMIT 1),
        (SELECT id FROM social_accounts_extended WHERE external_id = $2 LIMIT 1),
        $3, $4, $5, $6, to_timestamp($7), NOW()
      )
      ON CONFLICT (event_external_id) DO NOTHING
      RETURNING id, post_id, social_account_id, event_type, metric_value, received_at, processed_at
    `,
      [
        value.media_id,
        entry.id,
        eventType,
        eventExternalId,
        metricValue,
        JSON.stringify(value),
        entry.time,
      ]
    );

    if (result.rows.length === 0) {
      // Já existe ou post não encontrado
      return null;
    }

    const row: any = result.rows[0];

    // Marcar como processado no Redis (1 hora TTL)
    await this.redis.setex(deduplicationKey, Math.ceil(this.deduplicationWindow / 1000), '1');

    // Atualizar cache de engajamento em tempo real
    await this.updateEngagementCache(row.post_id, eventType, metricValue);

    logger.info({ postId: row.post_id, eventType, metricValue }, 'Evento de engajamento armazenado');

    return {
      id: row.id,
      postId: row.post_id,
      socialAccountId: row.social_account_id,
      eventType,
      eventExternalId,
      metricValue,
      receivedAt: new Date(row.received_at),
      processedAt: new Date(row.processed_at),
      createdAt: new Date(),
    };
  }

  /**
   * Atualizar cache Redis com engajamento em tempo real por post
   * Usado para análises rápidas de trending
   */
  private async updateEngagementCache(
    postId: string,
    eventType: string,
    metricValue: number
  ): Promise<void> {
    const cacheKey = `engagement:post:${postId}`;
    const fieldKey = `${eventType}:count`;

    // Increment counter
    await this.redis.hincrby(cacheKey, fieldKey, metricValue);

    // Update last_updated
    await this.redis.hset(cacheKey, 'last_updated', new Date().toISOString());

    // Set TTL: 24 horas
    await this.redis.expire(cacheKey, 86400);
  }

  /**
   * Obter engagement em tempo real de um post a partir do cache
   */
  async getPostEngagementRealtime(postId: string): Promise<{
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    clicks: number;
    lastUpdated: Date;
  }> {
    const cacheKey = `engagement:post:${postId}`;
    const data = await this.redis.hgetall(cacheKey);

    return {
      likes: parseInt(data['like:count'] || '0'),
      comments: parseInt(data['comment:count'] || '0'),
      shares: parseInt(data['share:count'] || '0'),
      impressions: parseInt(data['impression:count'] || '0'),
      clicks: parseInt(data['click:count'] || '0'),
      lastUpdated: data.last_updated ? new Date(data.last_updated) : new Date(),
    };
  }

  /**
   * Calcular engagement rate de um post
   * engagement_rate = (likes + comments + shares) / impressions
   */
  async calculateEngagementRate(postId: string): Promise<number> {
    const engagement = await this.getPostEngagementRealtime(postId);

    if (engagement.impressions === 0) return 0;

    const totalEngagement = engagement.likes + engagement.comments + engagement.shares;
    return (totalEngagement / engagement.impressions) * 100; // percentual
  }

  /**
   * Obter trending posts (com alto engajamento nos últimos 30 min)
   */
  async getTrendingPosts(limit: number = 10): Promise<Array<{
    postId: string;
    engagementRate: number;
    totalEngagement: number;
  }>> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60000);

    const result = await query(
      `
      SELECT post_id,
             SUM(CASE WHEN event_type = 'like' THEN metric_value ELSE 0 END) as likes,
             SUM(CASE WHEN event_type = 'comment' THEN metric_value ELSE 0 END) as comments,
             SUM(CASE WHEN event_type = 'share' THEN metric_value ELSE 0 END) as shares,
             SUM(CASE WHEN event_type = 'impression' THEN metric_value ELSE 0 END) as impressions
      FROM engagement_events
      WHERE received_at > $1
      GROUP BY post_id
      HAVING SUM(metric_value) > 0
      ORDER BY (likes + comments + shares) DESC
      LIMIT $2
    `,
      [thirtyMinutesAgo, limit]
    );

    return result.rows.map((row: any) => ({
      postId: row.post_id,
      totalEngagement: parseInt(row.likes) + parseInt(row.comments) + parseInt(row.shares),
      engagementRate:
        row.impressions > 0
          ? (((parseInt(row.likes) + parseInt(row.comments) + parseInt(row.shares)) /
              parseInt(row.impressions)) *
              100)
              .toFixed(2) + '%'
          : '0%',
    }));
  }

  /**
   * Limpar cache expirado (cron job)
   */
  async cleanupExpiredCache(): Promise<void> {
    // Redis TTL já cuida disso automaticamente
    logger.info({}, 'Cache cleanup executado');
  }
}

export const engagementAggregator = new EngagementAggregator();
