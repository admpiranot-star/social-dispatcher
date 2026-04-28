/**
 * Timing Optimizer
 * Machine Learning simples para aprender melhor hora de postar por categoria
 * Usa histórico de engagement para regressão linear
 */

import { query } from '../db/client';
import { logger } from './logger';

export interface TimingPattern {
  category: string;
  hour: number;
  averageEngagementRate: number;
  confidence: number; // 0-1
  sampleSize: number;
}

export interface TimingRecommendation {
  category: string;
  optimalHour: number;
  optimalDay?: string; // 'weekday' | 'weekend' | 'any'
  confidence: number;
  expectedEngagementRate: number;
  reason: string;
}

export class TimingOptimizer {
  private readonly MIN_SAMPLES = 5; // Mínimo de amostras para validar pattern
  private cache: Map<string, TimingPattern[]> = new Map();
  private lastUpdate: Date = new Date();

  /**
   * Obter recomendação de melhor hora para postar
   */
  async getOptimalTiming(
    category: string
  ): Promise<TimingRecommendation> {
    try {
      const patterns = await this.getTimingPatterns(category);

      if (patterns.length === 0) {
        logger.warn({ category }, 'Nenhum padrão encontrado, usando default');
        return this.getDefaultTiming(category);
      }

      // Encontrar hora com maior engagement
      const best = patterns.reduce((prev, current) =>
        current.averageEngagementRate > prev.averageEngagementRate ? current : prev
      );

      // Validar confiabilidade
      const confidence = best.confidence;

      return {
        category,
        optimalHour: best.hour,
        confidence,
        expectedEngagementRate: best.averageEngagementRate,
        reason:
          confidence > 0.8
            ? `Padrão sólido com ${best.sampleSize} amostras`
            : confidence > 0.5
              ? `Tendência com ${best.sampleSize} amostras`
              : `Previsão inicial com ${best.sampleSize} amostras`,
      };
    } catch (err: any) {
      logger.error({ error: err.message, category }, 'Erro ao otimizar timing');
      return this.getDefaultTiming(category);
    }
  }

  /**
   * Analisar padrões de timing para uma categoria
   */
  private async getTimingPatterns(category: string): Promise<TimingPattern[]> {
    try {
      // Verificar cache
      if (
        this.cache.has(category) &&
        Date.now() - this.lastUpdate.getTime() < 3600000
      ) {
        return this.cache.get(category)!;
      }

      // Query: agrupar por hora do dia e calcular engagement médio
      const result = await query(
        `
        SELECT
          EXTRACT(HOUR FROM p.created_at AT TIME ZONE 'America/Sao_Paulo') as hour,
          COUNT(p.id) as sample_size,
          AVG(
            (SELECT COALESCE(SUM(ee.metric_value), 0) FROM engagement_events ee 
             WHERE ee.post_id = p.id AND ee.event_type IN ('like','comment','share')) /
            NULLIF((SELECT COALESCE(SUM(ee.metric_value), 0) FROM engagement_events ee 
             WHERE ee.post_id = p.id AND ee.event_type = 'impression'), 0)
          ) * 100 as avg_engagement_rate
        FROM posts p
        WHERE p.category = $1
        AND p.status = 'published'
        AND p.created_at > NOW() - INTERVAL '90 days'
        GROUP BY EXTRACT(HOUR FROM p.created_at AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY avg_engagement_rate DESC
      `,
        [category]
      );

      const patterns: TimingPattern[] = result.rows.map((row: any) => ({
        category,
        hour: parseInt(row.hour),
        averageEngagementRate: parseFloat(row.avg_engagement_rate) || 0,
        sampleSize: parseInt(row.sample_size),
        confidence: Math.min(1, parseInt(row.sample_size) / 20), // 20+ amostras = 100% confiante
      }));

      // Filtrar padrões com amostras mínimas
      const validPatterns = patterns.filter((p) => p.sampleSize >= this.MIN_SAMPLES);

      // Cachear
      this.cache.set(category, validPatterns);
      this.lastUpdate = new Date();

      logger.info(
        { category, patternsFound: validPatterns.length },
        '📊 Padrões de timing analisados'
      );

      return validPatterns;
    } catch (err: any) {
      logger.error(
        { error: err.message, category },
        'Erro ao analisar padrões de timing'
      );
      return [];
    }
  }

  /**
   * Timing padrão quando não há dados
   */
  private getDefaultTiming(category: string): TimingRecommendation {
    const defaults: Record<string, { hour: number; rate: number }> = {
      politics: { hour: 14, rate: 0.08 }, // 2pm
      technology: { hour: 10, rate: 0.06 }, // 10am
      sports: { hour: 15, rate: 0.09 }, // 3pm
      entertainment: { hour: 20, rate: 0.07 }, // 8pm
      economy: { hour: 9, rate: 0.05 }, // 9am
      lotteries: { hour: 19, rate: 0.12 }, // 7pm
      other: { hour: 12, rate: 0.05 }, // noon
    };

    const timing = defaults[category] || defaults.other;

    return {
      category,
      optimalHour: timing.hour,
      confidence: 0.3,
      expectedEngagementRate: timing.rate,
      reason: 'Usando timing padrão até acumular dados',
    };
  }

  /**
   * Prever engagement para uma hora específica
   */
  async predictEngagement(
    category: string,
    hour: number
  ): Promise<number> {
    try {
      const patterns = await this.getTimingPatterns(category);

      // Encontrar padrão exato ou mais próximo
      const exactMatch = patterns.find((p) => p.hour === hour);
      if (exactMatch) {
        return exactMatch.averageEngagementRate;
      }

      // Se não houver match exato, interpolar
      const lower = patterns.filter((p) => p.hour < hour).sort((a, b) => b.hour - a.hour)[0];
      const upper = patterns.filter((p) => p.hour > hour).sort((a, b) => a.hour - b.hour)[0];

      if (!lower && !upper) return 0;
      if (!lower) return upper.averageEngagementRate;
      if (!upper) return lower.averageEngagementRate;

      // Interpolação linear
      const ratio = (hour - lower.hour) / (upper.hour - lower.hour);
      return lower.averageEngagementRate * (1 - ratio) + upper.averageEngagementRate * ratio;
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Erro ao predizer engagement');
      return 0.05; // Default fallback
    }
  }

  /**
   * Invalidar cache (após novo engagement registrado)
   */
  invalidateCache(category?: string): void {
    if (category) {
      this.cache.delete(category);
    } else {
      this.cache.clear();
    }
    logger.debug({ category: category || 'all' }, 'Cache de timing invalidado');
  }

  /**
   * Obter estatísticas de otimização (para dashboard)
   */
  async getOptimizationStats(): Promise<any> {
    try {
      const categories = ['politics', 'economy', 'sports', 'technology', 'entertainment', 'lotteries'];
      const stats: Record<string, TimingRecommendation> = {};

      for (const category of categories) {
        stats[category] = await this.getOptimalTiming(category);
      }

      return {
        timestamp: new Date().toISOString(),
        cacheSize: this.cache.size,
        lastUpdate: this.lastUpdate.toISOString(),
        recommendations: stats,
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao obter stats de otimização');
      return {};
    }
  }

  /**
   * Comparar timing atual com recomendado
   */
  async shouldReschedule(
    category: string,
    currentHour: number
  ): Promise<{
    shouldReschedule: boolean;
    optimalHour: number;
    improvementPercentage: number;
  }> {
    try {
      const currentEngagement = await this.predictEngagement(category, currentHour);
      const optimal = await this.getOptimalTiming(category);

      const improvement =
        ((optimal.expectedEngagementRate - currentEngagement) / currentEngagement) * 100;

      return {
        shouldReschedule: improvement > 15, // Reschedule se melhoria > 15%
        optimalHour: optimal.optimalHour,
        improvementPercentage: Math.round(improvement),
      };
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Erro ao comparar timing');
      return {
        shouldReschedule: false,
        optimalHour: currentHour,
        improvementPercentage: 0,
      };
    }
  }
}

export const timingOptimizer = new TimingOptimizer();
