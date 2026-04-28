/**
 * Council Decision
 * Agrega votos dos 3 especialistas e toma decisão final
 * Usa consenso ponderado para determinar scheduling
 */

import { logger } from '../lib/logger';
import { SocialPostPayload, AgentVote } from '../types';

export class CouncilDecision {
  /**
   * Agregar votos dos 3 especialistas e tomar decisão sobre novo post
   */
  async makeDecision(
    architectVote: AgentVote,
    strategistVote: AgentVote & { recommendedDelay?: number },
    operatorVote: AgentVote,
    post: SocialPostPayload
  ): Promise<{
    scheduledAt: Date;
    priorityScore: number;
    consensus: number;
    reasoning: string;
    votes: Record<string, AgentVote>;
  }> {
    try {
      // 1. Pesar votos (weighted consensus)
      const weights = {
        architect: 0.35, // Técnico tem 35%
        strategist: 0.45, // Estratégico tem 45%
        operator: 0.20, // Operador tem 20%
      };

      const consensusScore =
        (architectVote.score * weights.architect +
          strategistVote.score * weights.strategist +
          operatorVote.score * weights.operator) /
        10; // Normalize 0-1

      // 2. Calcular delay até publicação
      const baseDelay = this.calculateDelay(consensusScore);
      const finalDelay = Math.max(0, baseDelay + (strategistVote.recommendedDelay || 0));

      // 3. Determinar horário final
      const now = new Date();
      const scheduledAt = new Date(now.getTime() + finalDelay);

      // 4. Construir reasoning
      const reasoning = this.buildReasoning(
        architectVote,
        strategistVote,
        operatorVote,
        consensusScore
      );

      logger.info(
        {
          postId: post.id,
          consensusScore: consensusScore.toFixed(2),
          finalDelay: `${(finalDelay / 60000).toFixed(1)}min`,
          scheduledAt: scheduledAt.toISOString(),
          votes: {
            architect: architectVote.score,
            strategist: strategistVote.score,
            operator: operatorVote.score,
          },
        },
        '🎯 Conselho decidiu'
      );

      return {
        scheduledAt,
        priorityScore: consensusScore,
        consensus: consensusScore,
        reasoning,
        votes: {
          architect: architectVote,
          strategist: strategistVote,
          operator: operatorVote,
        },
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Council decision error');
      throw err;
    }
  }

  /**
   * Decidir se deve reprioritizar post na fila
   */
  async shouldReprioritize(
    architectVote: AgentVote,
    strategistVote: AgentVote & { expectedEngagement?: number },
    operatorVote: AgentVote
  ): Promise<boolean> {
    try {
      // Threshold de consenso para reprioritizar: 7+/10
      const consensusScore =
        (architectVote.score * 0.35 +
          strategistVote.score * 0.45 +
          operatorVote.score * 0.2) /
        10;

      const shouldReprioritize = consensusScore >= 7;

      logger.debug(
        {
          consensusScore: consensusScore.toFixed(2),
          shouldReprioritize,
          votes: {
            architect: architectVote.score,
            strategist: strategistVote.score,
            operator: operatorVote.score,
          },
        },
        'Reprioritization decision'
      );

      return shouldReprioritize;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Reprioritization decision error');
      return false; // Falhar safe: não reprioritizar
    }
  }

  /**
   * Calcular delay (em ms) baseado no score de consenso
   * Score 10 = sair NA HORA (0 delay)
   * Score 5 = esperar 30 min
   * Score 1 = esperar até 2 horas
   */
  private calculateDelay(consensusScore: number): number {
    // Fórmula: delay = (11 - score) * 12 minutos
    // Score 10 -> 12 min (stories)
    // Score 9 -> 24 min
    // Score 5 -> 72 min (1.2 horas)
    // Score 1 -> 120 min (2 horas)

    const delayMinutes = (11 - consensusScore * 10) * 12;
    return Math.max(0, delayMinutes * 60000); // Converter para ms
  }

  /**
   * Construir narrativa de decisão para logging e auditoria
   */
  private buildReasoning(
    architectVote: AgentVote,
    strategistVote: AgentVote,
    operatorVote: AgentVote,
    consensusScore: number
  ): string {
    const parts = [
      `🏗️ Arquiteto (${architectVote.score}/10): ${architectVote.rationale}`,
      `📈 Estrategista (${strategistVote.score}/10): ${strategistVote.rationale}`,
      `👤 Operador (${operatorVote.score}/10): ${operatorVote.rationale}`,
      `✅ Consenso: ${(consensusScore * 100).toFixed(0)}%`,
    ];

    return parts.join(' | ');
  }
}

export const councilDecision = new CouncilDecision();
