/**
 * Queue State Management
 * Persistência de estado da fila em PostgreSQL + sincronização com Redis Sorted Sets
 * Suporta repriorização dinâmica com optimistic locking
 */

import { query, queryOne } from '../db/client';
import { logger } from '../lib/logger';
import Redis from 'ioredis';
import { QueueState } from '../types';
import { config } from '../config';

export class QueueStateManager {
  private redis: Redis;

  constructor(redisUrl: string = config.REDIS_URL) {
    this.redis = new Redis(redisUrl);
  }

  /**
   * Adicionar item à fila
   */
  async addToQueue(
    postId: string,
    channel: string,
    scheduledAt: Date,
    priorityScore: number = 5
  ): Promise<QueueState> {
    try {
      // 1. Get next queue position
      const posResult = await query(
        `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next_pos
         FROM queue_state
         WHERE channel = $1 AND scheduled_at > NOW()`,
        [channel]
      );
      const nextPos = posResult.rows[0]?.next_pos ?? 1;

      // 2. Insert into PostgreSQL
      const result = await queryOne(
        `INSERT INTO queue_state (
          post_id, channel, scheduled_at, priority_score,
          queue_position, reprioritized_count, version
        )
        VALUES ($1, $2, $3, $4, $5, 0, 1)
        RETURNING id, post_id, channel, scheduled_at, priority_score,
                  queue_position, reprioritized_count, last_reprioritized_at,
                  version, created_at, updated_at`,
        [postId, channel, scheduledAt.toISOString(), priorityScore, nextPos]
      );

      const queueItem = this.mapRowToQueueState(result);

      // 2. Sincronizar em Redis Sorted Set (score = timestamp)
      const sortedSetKey = `queue:${channel}`;
      await this.redis.zadd(sortedSetKey, scheduledAt.getTime(), postId);

      logger.info({ postId, channel, position: queueItem.queuePosition }, 'Item adicionado à fila');
      return queueItem;
    } catch (err: any) {
      logger.error({ error: err.message, postId, channel }, 'Erro ao adicionar à fila');
      throw err;
    }
  }

  /**
   * Obter estado atual da fila por channel
   */
  async getQueueState(channel: string): Promise<QueueState[]> {
    try {
      const result = await query(
        `
        SELECT id, post_id, channel, scheduled_at, priority_score,
               queue_position, reprioritized_count, last_reprioritized_at,
               version, created_at, updated_at
        FROM queue_state
        WHERE channel = $1 AND scheduled_at > NOW()
        ORDER BY queue_position ASC
      `,
        [channel]
      );

      return result.rows.map((row: any) => this.mapRowToQueueState(row));
    } catch (err: any) {
      logger.error({ error: err.message, channel }, 'Erro ao obter fila');
      throw err;
    }
  }

  /**
   * Reprioritizar item (mover para topo)
   * Usa optimistic locking com version field
   */
  async reprioritizeItem(
    postId: string,
    newScheduledAt: Date,
    currentVersion: number
  ): Promise<QueueState> {
    try {
      // 1. Update com version check (optimistic locking)
      const result = await queryOne(
        `
        UPDATE queue_state
        SET scheduled_at = $2,
            queue_position = 1,
            reprioritized_count = reprioritized_count + 1,
            last_reprioritized_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE post_id = $1 AND version = $3
        RETURNING id, post_id, channel, scheduled_at, priority_score,
                  queue_position, reprioritized_count, last_reprioritized_at,
                  version, created_at, updated_at
      `,
        [postId, newScheduledAt, currentVersion]
      );

      if (!result) {
        throw new Error('Version conflict: item foi modificado por outro processo');
      }

      const queueItem = this.mapRowToQueueState(result);

      // 2. Atualizar Redis Sorted Set
      const sortedSetKey = `queue:${queueItem.channel}`;
      await this.redis.zadd(sortedSetKey, newScheduledAt.getTime(), postId);

      logger.info(
        { postId, newScheduledAt, position: queueItem.queuePosition },
        'Item reprioritizado'
      );
      return queueItem;
    } catch (err: any) {
      logger.error({ error: err.message, postId }, 'Erro ao reprioritizar');
      throw err;
    }
  }

  /**
   * Obter item específico da fila
   */
  async getQueueItem(postId: string): Promise<QueueState | null> {
    try {
      const result = await queryOne(
        `
        SELECT id, post_id, channel, scheduled_at, priority_score,
               queue_position, reprioritized_count, last_reprioritized_at,
               version, created_at, updated_at
        FROM queue_state
        WHERE post_id = $1
      `,
        [postId]
      );

      return result ? this.mapRowToQueueState(result) : null;
    } catch (err: any) {
      logger.error({ error: err.message, postId }, 'Erro ao obter item da fila');
      throw err;
    }
  }

  /**
   * Remover item da fila (após publicação)
   */
  async removeFromQueue(postId: string): Promise<void> {
    try {
      // 1. Obter channel antes de deletar
      const item = await this.getQueueItem(postId);

      // 2. Deletar do PostgreSQL
      await query('DELETE FROM queue_state WHERE post_id = $1', [postId]);

      // 3. Remover do Redis Sorted Set
      if (item) {
        const sortedSetKey = `queue:${item.channel}`;
        await this.redis.zrem(sortedSetKey, postId);
      }

      logger.info({ postId }, 'Item removido da fila');
    } catch (err: any) {
      logger.error({ error: err.message, postId }, 'Erro ao remover da fila');
      throw err;
    }
  }

  /**
   * Obter próximo item a ser publicado (ordered by scheduled_at)
   */
  async getNextToPublish(channel: string): Promise<QueueState | null> {
    try {
      const result = await queryOne(
        `
        SELECT id, post_id, channel, scheduled_at, priority_score,
               queue_position, reprioritized_count, last_reprioritized_at,
               version, created_at, updated_at
        FROM queue_state
        WHERE channel = $1 AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT 1
      `,
        [channel]
      );

      return result ? this.mapRowToQueueState(result) : null;
    } catch (err: any) {
      logger.error({ error: err.message, channel }, 'Erro ao obter próximo item');
      throw err;
    }
  }

  /**
   * Obter top N da fila para análise de repriorização
   */
  async getTopItems(channel: string, limit: number = 5): Promise<QueueState[]> {
    try {
      const result = await query(
        `
        SELECT id, post_id, channel, scheduled_at, priority_score,
               queue_position, reprioritized_count, last_reprioritized_at,
               version, created_at, updated_at
        FROM queue_state
        WHERE channel = $1 AND scheduled_at > NOW()
        ORDER BY queue_position ASC
        LIMIT $2
      `,
        [channel, limit]
      );

      return result.rows.map((row: any) => this.mapRowToQueueState(row));
    } catch (err: any) {
      logger.error({ error: err.message, channel }, 'Erro ao obter top items');
      throw err;
    }
  }

  /**
   * Obter todas as filas (consolidado)
   */
  async getAllQueueStats(): Promise<Record<string, number>> {
    try {
      const result = await query(
        `
        SELECT channel, COUNT(*) as count
        FROM queue_state
        WHERE scheduled_at > NOW()
        GROUP BY channel
      `
      );

      const stats: Record<string, number> = {};
      for (const row of result.rows) {
        stats[row.channel] = parseInt(row.count);
      }

      return stats;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao obter stats');
      throw err;
    }
  }

  /**
   * Helper: Mapear linha do banco para objeto QueueState
   */
  private mapRowToQueueState(row: any): QueueState {
    return {
      id: row.id,
      postId: row.post_id,
      channel: row.channel,
      scheduledAt: new Date(row.scheduled_at),
      priorityScore: row.priority_score,
      queuePosition: row.queue_position,
      reprioritizedCount: row.reprioritized_count,
      lastReprioritizedAt: row.last_reprioritized_at ? new Date(row.last_reprioritized_at) : undefined,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      engagementRate: 0, // Will be calculated from engagement_events
      isStory: false, // Will be determined from post type
    };
  }
}

export const queueStateManager = new QueueStateManager();
