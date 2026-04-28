/**
 * Operator Specialist
 * Responsável por interface com editor: notificações, validação de input, UX signals
 */

import { logger } from '../../lib/logger';
import { SocialPostPayload, QueueState, AgentVote } from '../../types';

export class Operator {
  /**
   * Avaliar novo post do ponto de vista do operador/editor
   * - Verificar se editor sinalizou preferência de timing
   * - Considerar urgência do conteúdo
   * - Detectar feedback anterior do editor
   */
  async evaluatePost(post: SocialPostPayload): Promise<AgentVote> {
    try {
      let score = 5; // Base neutro
      let rationale = 'Sem sinais do editor';

      // 1. Se editor explicitamente marcou horário, respeitar
      if (post.scheduledAt) {
        score = 10; // Editor tem prioridade máxima
        rationale = `Editor marcou ${post.scheduledAt.toLocaleTimeString()}`;
      }

      // 2. Se é draft/preview, baixa prioridade
      else if (post.category === 'other' && post.priority < 3) {
        score = 2;
        rationale = 'Conteúdo de teste/draft, prioridade baixa';
      }

      // 3. Se é update/breaking, respeitar urgência
      else if (post.priority > 7) {
        score = 9;
        rationale = 'Editor sinalizou alta urgência';
      }

      return {
        specialist: 'operator',
        score,
        rationale,
        metadata: {
          hasScheduledTime: !!post.scheduledAt,
          scheduledAt: post.scheduledAt?.toISOString(),
          priority: post.priority,
        },
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Operator evaluation error');
      throw err;
    }
  }

  /**
   * Avaliar se deve reprioritizar baseado em sinais do editor
   * - Verificar se editor marcou "urgent"
   * - Considerar feedback de cliques anteriores
   * - Evitar mudar posts que editor está monitorando
   */
  async evaluateReprioritization(queueItem: QueueState): Promise<AgentVote> {
    try {
      let score = 5;
      let rationale = '';

      // 1. Se post recentemente movimentado (< 5 min), evitar trocar de novo (thrashing)
      if (queueItem.lastReprioritizedAt) {
        const timeSinceLastMove = Date.now() - queueItem.lastReprioritizedAt.getTime();
        if (timeSinceLastMove < 300000) {
          // < 5 min
          score = 1;
          rationale = 'Post recentemente movido, evitar thrashing de fila';
        }
      }

      // 2. Se post está em posição "boa" (top 3), deixar quieto
      if (queueItem.queuePosition <= 3) {
        score = 3;
        rationale = 'Post em bom posicionamento, evitar movimento';
      } else {
        score = 6;
        rationale = 'Aceitar sugestão de reprioritização';
      }

      return {
        specialist: 'operator',
        score,
        rationale,
        metadata: {
          queuePosition: queueItem.queuePosition,
          lastReprioritizedAt: queueItem.lastReprioritizedAt?.toISOString(),
          reprioritizedCount: queueItem.reprioritizedCount,
        },
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Operator reprioritization error');
      throw err;
    }
  }

  /**
   * Validar se editor pode fazer override manual
   * - Verificar permissões
   * - Validar data/hora
   * - Checar constraints técnicos
   */
  async validateEditorInput(
    postId: string,
    newScheduledAt: Date,
    reason: string
  ): Promise<{
    isValid: boolean;
    error?: string;
  }> {
    try {
      // 1. Validar data não é no passado
      if (newScheduledAt < new Date()) {
        return {
          isValid: false,
          error: 'Não pode agendar para o passado',
        };
      }

      // 2. Validar não é muito longe no futuro (> 7 dias)
      const maxFutureDate = new Date(Date.now() + 7 * 24 * 3600000);
      if (newScheduledAt > maxFutureDate) {
        return {
          isValid: false,
          error: 'Não pode agendar mais de 7 dias no futuro',
        };
      }

      // 3. Validar se há reason (rastreabilidade)
      if (!reason || reason.trim().length === 0) {
        return {
          isValid: false,
          error: 'Motivo é obrigatório',
        };
      }

      logger.info(
        { postId, newScheduledAt, reason },
        '✅ Editor input validado'
      );

      return { isValid: true };
    } catch (err: any) {
      logger.error({ error: err.message, postId }, 'Validation error');
      return {
        isValid: false,
        error: 'Erro ao validar entrada do editor',
      };
    }
  }

  /**
   * Notificar editor sobre decisão do agente
   * (Implementação futura: enviar via Slack, email, push)
   */
  async notifyEditor(
    postId: string,
    decision: 'scheduled' | 'reprioritized' | 'error',
    details: Record<string, any>
  ): Promise<void> {
    try {
      logger.info(
        { postId, decision, details },
        '📢 Notificação para editor'
      );

      // TODO: Implementar notificações reais (Slack, push, etc)
      // Por enquanto apenas logging

      switch (decision) {
        case 'scheduled':
          logger.info(
            { postId, scheduledAt: details.scheduledAt },
            '✅ Editor notificado: post agendado'
          );
          break;
        case 'reprioritized':
          logger.info(
            { postId, newPosition: details.newPosition },
            '📍 Editor notificado: post reprioritizado'
          );
          break;
        case 'error':
          logger.error(
            { postId, error: details.error },
            '❌ Editor notificado: erro ao publicar'
          );
          break;
      }
    } catch (err: any) {
      logger.error({ error: err.message, postId }, 'Notification error');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    // Operator não depende de BD, sempre OK
    return true;
  }
}
