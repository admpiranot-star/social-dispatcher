/**
 * Strategist Specialist
 * Responsável por decisões de negócio: timing ótimo, engagement analysis, trend detection
 *
 * v2: Usa TimingOptimizer (ML) ao invés de heurísticas hardcoded.
 * Cai em fallback quando não há dados históricos suficientes.
 */

import { query } from '../../db/client';
import { logger } from '../../lib/logger';
import { SocialPostPayload, QueueState, AgentVote } from '../../types';
import { engagementAggregator } from '../../engagement/aggregator';
import { timingOptimizer } from '../../lib/timing-optimizer';

export class Strategist {
  /**
   * Avaliar novo post do ponto de vista estratégico
   * - Consulta TimingOptimizer (ML) para hora ideal por categoria
   * - Cai em fallback quando confiança < 0.3
   * - Considera posts similares na fila
   */
  async evaluatePost(post: SocialPostPayload): Promise<AgentVote> {
    try {
      // 1. Obter timing ótimo do ML (usa histórico real do banco)
      const optimalTiming = await timingOptimizer.getOptimalTiming(post.category);

      // 2. Calcular score de timing (0-10) baseado na hora atual vs ideal
      const now = new Date();
      const timingScore = this.calculateTimingScore(now, optimalTiming.optimalHour);

      // 3. Analisar se há posts similares na fila
      const similarPostsInQueue = await this.findSimilarPostsInQueue(post.category);

      let score = timingScore;
      let rationale = `Timing score: ${timingScore}/10 para ${post.category} ` +
        `(hora ideal: ${optimalTiming.optimalHour}h, confiança: ${(optimalTiming.confidence * 100).toFixed(0)}%)`;

      // 4. Se há posts similares na fila, espaçar este
      if (similarPostsInQueue > 1) {
        score = Math.max(1, score - 2);
        rationale += `. ${similarPostsInQueue} posts similares na fila, espaçar`;
      }

      // 5. Breaking news: ignorar timing
      if (post.priority > 8) {
        score = 10;
        rationale = 'Breaking news: timing ótimo irrelevante';
      }

      return {
        specialist: 'strategist',
        score,
        rationale,
        metadata: {
          category: post.category,
          optimalHour: optimalTiming.optimalHour,
          currentHour: now.getHours(),
          similarPostsInQueue,
          expectedEngagement: optimalTiming.expectedEngagementRate,
          confidence: optimalTiming.confidence,
          reason: optimalTiming.reason,
        },
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Strategist evaluation error');
      throw err;
    }
  }

  /**
   * Avaliar se deve reprioritizar baseado em engagement
   * - Usa engagement real do cache Redis quando disponível
   * - Cai em baseline fixo quando não há dados
   */
  async evaluateReprioritization(queueItem: QueueState): Promise<AgentVote & { recommendedDelay: number }> {
    try {
      // 1. Calcular engagement rate (Redis cache em tempo real)
      const engagement = await engagementAggregator.getPostEngagementRealtime(queueItem.postId);
      const engagementRate = await engagementAggregator.calculateEngagementRate(queueItem.postId);

      // 2. Comparar com baseline da categoria
      const categoryBaseline = await this.getCategoryEngagementBaseline(queueItem.channel);

      let score = 5;
      let rationale = '';
      let recommendedDelay = 0;
      let reason: 'breaking_news' | 'high_engagement' | 'category_trending' | 'manual_override' | 'system_optimization' =
        'system_optimization';
      let expectedEngagement = 0;

      if (engagementRate > categoryBaseline * 1.5) {
        score = 9;
        rationale = `Alto engagement (${engagementRate.toFixed(1)}% vs ${categoryBaseline.toFixed(1)}%), acelerar próximo`;
        recommendedDelay = 10 * 60000;
        reason = 'high_engagement';
        expectedEngagement = engagementRate * 0.9;
      } else if (engagementRate >= categoryBaseline) {
        score = 5;
        rationale = `Engagement normal (${engagementRate.toFixed(1)}%), spacing padrão`;
        recommendedDelay = 30 * 60000;
        reason = 'system_optimization';
        expectedEngagement = engagementRate * 0.8;
      } else {
        score = 2;
        rationale = `Engagement baixo (${engagementRate.toFixed(1)}% vs ${categoryBaseline.toFixed(1)}%), adiar próximo`;
        recommendedDelay = 60 * 60000;
        reason = 'system_optimization';
        expectedEngagement = engagementRate * 0.7;
      }

      return {
        specialist: 'strategist',
        score,
        rationale,
        recommendedDelay,
        reason,
        expectedEngagement,
        metadata: {
          engagementRate,
          categoryBaseline,
          engagement,
          reason,
        },
      } as any;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Strategist reprioritization error');
      throw err;
    }
  }

  /**
   * Obter engagement baseline por canal
   * Usa dados reais do timing optimizer quando disponível.
   */
  private async getCategoryEngagementBaseline(channel: string): Promise<number> {
    try {
      // Tentar usar ML para obter baseline real
      const timing = await timingOptimizer.getOptimalTiming(channel);
      if (timing.confidence > 0.5 && timing.expectedEngagementRate > 0) {
        return timing.expectedEngagementRate;
      }

      // Fallback: valores fixos quando não há dados suficientes
      const baselines: Record<string, number> = {
        politics: 0.08,
        technology: 0.06,
        sports: 0.09,
        entertainment: 0.07,
        economy: 0.05,
        lotteries: 0.12,
        other: 0.05,
      };

      return baselines[channel] || 0.05;
    } catch (err: any) {
      logger.warn({ error: err.message, channel }, 'Error getting baseline engagement');
      return 0.05;
    }
  }

  /**
   * Encontrar posts similares já na fila
   */
  private async findSimilarPostsInQueue(category: string): Promise<number> {
    try {
      const result = await query(
        `SELECT COUNT(*) as count FROM queue_state qs
         WHERE qs.post_id IN (
           SELECT id FROM posts WHERE category = $1 AND status != 'published'
         )`,
        [category]
      );

      return parseInt(result.rows[0].count || '0');
    } catch (err: any) {
      logger.warn({ error: err.message, category }, 'Error finding similar posts');
      return 0;
    }
  }

  /**
   * Calcular score de timing (0-10)
   * Score alto = boa hora para postar
   */
  private calculateTimingScore(now: Date, optimalHour: number): number {
    const currentHour = now.getHours();
    const hourDifference = Math.abs(currentHour - optimalHour);

    if (hourDifference === 0) return 10;
    if (hourDifference <= 2) return 8;
    if (hourDifference <= 4) return 6;
    if (hourDifference <= 8) return 3;
    return 1;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await query('SELECT COUNT(*) FROM posts LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }
}