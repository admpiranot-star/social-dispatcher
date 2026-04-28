/**
 * Architect Specialist
 * Responsável por decisões técnicas: repriorização, race conditions, limites de fila
 */

import { query } from '../../db/client';
import { logger } from '../../lib/logger';
import { SocialPostPayload, QueueState, AgentVote } from '../../types';

export class Architect {
  /**
   * Avaliar novo post do ponto de vista técnico
   * - Verificar limites de fila
   * - Detectar posts similares já enfileirados
   * - Calcular recursos disponíveis
   */
  async evaluatePost(post: SocialPostPayload): Promise<AgentVote> {
    try {
      // 1. Contar posts na fila para esse channel
      const queueSize = await query(
        `SELECT COUNT(*) as count FROM queue_state WHERE channel = ANY($1)`,
        [post.channels]
      );

      const currentQueueSize = parseInt(queueSize.rows[0].count || 0);
      const maxQueueSize = 200; // Limite soft de fila

      let score = 5; // Base score
      let rationale = `Queue size: ${currentQueueSize}/${maxQueueSize}`;

      // 2. Se fila está vazia, urgência alta
      if (currentQueueSize === 0) {
        score = 9;
        rationale = 'Fila vazia, sair imediatamente';
      }
      // 3. Se fila está lotada, urgência baixa (push para depois)
      else if (currentQueueSize > maxQueueSize * 0.8) {
        score = 3;
        rationale = 'Fila próxima ao limite, adiar post';
      }
      // 4. Se fila está normal, usar prioridade do post
      else {
        score = Math.min(10, Math.max(1, post.priority));
        rationale = `Fila normal, usar priority=${post.priority}`;
      }

      // 5. Breaking news tem urgência máxima (bypass fila)
      if (post.priority > 8) {
        score = 10;
        rationale = 'Breaking news detected, máxima urgência';
      }

      return {
        specialist: 'architect',
        score,
        rationale,
        metadata: {
          queueSize: currentQueueSize,
          maxQueueSize,
        },
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Architect evaluation error');
      throw err;
    }
  }

  /**
   * Avaliar se deve reprioritizar post já na fila
   * - Detectar post em risco (muito tempo na fila)
   * - Verificar race conditions
   * - Calcular impacto de mover para topo
   */
  async evaluateReprioritization(queueItem: QueueState): Promise<AgentVote> {
    try {
      const now = new Date();
      const timeSinceScheduled = now.getTime() - queueItem.scheduledAt.getTime();
      const maxWaitTime = 3600000; // 1 hora máximo na fila

      let score = 0;
      let rationale = '';

      // 1. Se post está muito tempo na fila, aumentar prioridade
      if (timeSinceScheduled > maxWaitTime) {
        score = 8;
        rationale = `Post esperando ${Math.floor(timeSinceScheduled / 60000)}min, reprioritizar`;
      }
      // 2. Se já foi reprioritizado muitas vezes, evitar race conditions
      else if (queueItem.reprioritizedCount > 3) {
        score = 1;
        rationale = 'Post já reprioritizado 3x, evitar thrashing';
      }
      // 3. Normal: aceitar sugestão do strategist
      else {
        score = 5;
        rationale = 'Aguardando análise de engagement do strategist';
      }

      return {
        specialist: 'architect',
        score,
        rationale,
        metadata: {
          timeSinceScheduled,
          reprioritizedCount: queueItem.reprioritizedCount,
          version: queueItem.version,
        },
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Architect reprioritization error');
      throw err;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await query('SELECT COUNT(*) FROM queue_state LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }
}
