/**
 * Bayesian Timing Optimizer — Thompson Sampling com distribuições Beta
 *
 * Substitui a regressão SQL simples do TimingOptimizer por inferência Bayesiana.
 * 
 * Para cada combinação (pageId, category, hour), mantém uma distribuição Beta(α, β):
 *   α = sucessos ponderados (engagement rate × peso)
 *   β = falhas ponderadas ((1 - engagement_rate) × peso)
 *
 * Thompson Sampling: a cada decisão, sorteia da Beta de cada hora candidata
 * e escolhe a com maior score. Isso naturalmente balança exploration vs exploitation.
 *
 * Exploration bonus: 10% das vezes, escolhe hora aleatória para descobrir novos padrões.
 *
 * Persistência: estado salvo na tabela bayesian_state no PostgreSQL,
 * recarregado no startup. Redis como cache quente.
 */

import { query } from '../db/client';
import { logger } from '../lib/logger';
import Redis from 'ioredis';

// =====================================================================
// Tipos
// =====================================================================

interface BetaDist {
  alpha: number; // sucessos
  beta: number;  // falhas
}

interface BayesianState {
  pageId: string;
  category: string;
  hour: number;
  alpha: number;
  beta: number;
  sampleCount: number;
  lastUpdated: Date;
}

interface TimingPrediction {
  optimalHour: number;
  confidence: number;    // 0-1
  expectedEngagement: number; // 0-1
  sampleSize: number;
  allScores: Array<{ hour: number; score: number; mean: number }>;
}

// =====================================================================
// SQL Schema
// =====================================================================

export const BAYESIAN_SCHEMA = `
CREATE TABLE IF NOT EXISTS bayesian_state (
  page_id       VARCHAR(50) NOT NULL,
  category      VARCHAR(50) NOT NULL,
  hour          SMALLINT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  alpha         REAL NOT NULL DEFAULT 2.0,
  beta          REAL NOT NULL DEFAULT 8.0,
  sample_count  INTEGER NOT NULL DEFAULT 0,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (page_id, category, hour)
);

CREATE INDEX IF NOT EXISTS idx_bayesian_page_cat 
  ON bayesian_state(page_id, category);
`;

// =====================================================================
// Engine
// =====================================================================

export class BayesianOptimizer {
  private cache: Map<string, Map<number, BetaDist>> = new Map();
  private redis: Redis;
  private initialized = false;
  private readonly EXPLORATION_RATE = 0.10; // 10% exploration
  private readonly WEIGHT = 10; // peso por observação
  private readonly MIN_SAMPLES_FOR_CONFIDENCE = 3;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /**
   * Initialize: load all state from DB into memory cache.
   */
  async init(): Promise<void> {
    await this.redis.connect().catch(() => {});
    
    try {
      // Create schema first (idempotent)
      await query(BAYESIAN_SCHEMA);

      // Load state from DB into memory cache
      const result = await query('SELECT * FROM bayesian_state ORDER BY page_id, category, hour');
      
      for (const row of result.rows) {
        const key = `${row.page_id}:${row.category}`;
        if (!this.cache.has(key)) {
          this.cache.set(key, new Map());
        }
        this.cache.get(key)!.set(parseInt(row.hour), {
          alpha: parseFloat(row.alpha),
          beta: parseFloat(row.beta),
        });
      }

      this.initialized = true;
      logger.info({ statesLoaded: result.rows.length }, 'BayesianOptimizer: estado carregado do DB');
    } catch (err: any) {
      logger.warn({ error: err.message }, 'BayesianOptimizer: DB não disponível, usando fallback');
      this.initialized = true; // allow operation without DB
    }
  }

  /**
   * Predizer a melhor hora para postar, dado pageId + category.
   * 
   * 1. Se dados insuficientes → hora padrão para a categoria
   * 2. Thompson Sampling → sorteia Beta de cada hora, escolhe a melhor
   * 3. 10% exploration → hora aleatória
   */
  async predict(pageId: string, category: string, now: Date = new Date()): Promise<TimingPrediction> {
    const key = `${pageId}:${category}`;
    const dists = this.cache.get(key);

    // Se não tem dados para esta (pageId, category), usa fallback da categoria
    if (!dists || dists.size < 3) {
      return this.getCategoryFallback(pageId, category);
    }

    // Exploration: 10% chance of random hour
    if (Math.random() < this.EXPLORATION_RATE) {
      const randomHour = Math.floor(Math.random() * 24);
      const randDist = dists.get(randomHour);
      return {
        optimalHour: randomHour,
        confidence: 0.1,
        expectedEngagement: randDist ? randDist.alpha / (randDist.alpha + randDist.beta) : 0.05,
        sampleSize: 0,
        allScores: [],
      };
    }

    // Thompson Sampling: sample from each Beta, pick max
    let bestHour = 8; // default
    let bestSample = -Infinity;
    const allScores: Array<{ hour: number; score: number; mean: number }> = [];

    for (let hour = 0; hour < 24; hour++) {
      const d = dists.get(hour);
      if (!d) continue;

      const sample = this.sampleBeta(d.alpha, d.beta);
      const mean = d.alpha / (d.alpha + d.beta);
      allScores.push({ hour, score: sample, mean });

      if (sample > bestSample) {
        bestSample = sample;
        bestHour = hour;
      }
    }

    // Confidence based on sample count
    const totalSamples = Array.from(dists.values()).reduce((s, d) => s + (d.alpha + d.beta) / this.WEIGHT, 0);
    const confidence = Math.min(1, totalSamples / 30); // 30+ samples = 100% confident
    
    const bestDist = dists.get(bestHour);
    const expectedEngagement = bestDist ? bestDist.alpha / (bestDist.alpha + bestDist.beta) : 0.05;

    return {
      optimalHour: bestHour,
      confidence,
      expectedEngagement,
      sampleSize: Math.round(totalSamples),
      allScores: allScores.sort((a, b) => b.score - a.score).slice(0, 5),
    };
  }

  /**
   * Update beliefs after observing actual engagement.
   * Called after a post is published and we have engagement data.
   */
  async update(
    pageId: string,
    category: string,
    hour: number,
    engagementRate: number, // 0-1
  ): Promise<void> {
    const key = `${pageId}:${category}`;
    
    if (!this.cache.has(key)) {
      this.cache.set(key, new Map());
    }
    
    const dists = this.cache.get(key)!;
    const existing = dists.get(hour);
    
    const alpha = (existing?.alpha || 2) + engagementRate * this.WEIGHT;
    const beta = (existing?.beta || 8) + (1 - engagementRate) * this.WEIGHT;
    
    dists.set(hour, { alpha, beta });

    // Persist to DB (async, non-blocking)
    this.persistState(pageId, category, hour, alpha, beta).catch(() => {});

    logger.debug(
      { pageId, category, hour, engagementRate, alpha: alpha.toFixed(1), beta: beta.toFixed(1) },
      'BayesianOptimizer: crença atualizada'
    );
  }

  /**
   * Get category-level fallback when page-specific data doesn't exist.
   * Aggregates across all pages for this category.
   */
  private getCategoryFallback(pageId: string, category: string): TimingPrediction {
    // Aggregate all pages for this category
    const aggregated: Map<number, { alpha: number; beta: number }> = new Map();

    for (const [key, dists] of this.cache.entries()) {
      const [, cat] = key.split(':');
      if (cat !== category) continue;

      for (const [hour, d] of dists.entries()) {
        if (!aggregated.has(hour)) {
          aggregated.set(hour, { alpha: d.alpha, beta: d.beta });
        } else {
          const a = aggregated.get(hour)!;
          a.alpha += d.alpha;
          a.beta += d.beta;
        }
      }
    }

    if (aggregated.size >= 3) {
      let bestHour = 8;
      let bestMean = -Infinity;
      
      for (const [hour, d] of aggregated.entries()) {
        const mean = d.alpha / (d.alpha + d.beta);
        if (mean > bestMean) {
          bestMean = mean;
          bestHour = hour;
        }
      }

      return {
        optimalHour: bestHour,
        confidence: 0.3,
        expectedEngagement: bestMean,
        sampleSize: Math.round(Array.from(aggregated.values()).reduce((s, d) => s + (d.alpha + d.beta), 0) / this.WEIGHT),
        allScores: [],
      };
    }

    // Hardcoded defaults (last resort)
    const defaults: Record<string, number> = {
      politics: 14, technology: 10, sports: 15, entertainment: 20,
      economy: 9, lotteries: 19, police: 13, jobs: 10, recipes: 11, other: 12,
    };

    return {
      optimalHour: defaults[category] || 12,
      confidence: 0.1,
      expectedEngagement: 0.05,
      sampleSize: 0,
      allScores: [],
    };
  }

  /**
   * Sample from Beta(α, β) using Gamma approximation.
   * Beta(α, β) = Gamma(α) / (Gamma(α) + Gamma(β))
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Marsaglia-Tsang method for Gamma sampling
    if (alpha < 1) {
      // Use Gamma(α+1) * U^(1/α) property for α < 1
      const u = Math.random();
      return this.sampleGamma(alpha + 1, 1) * Math.pow(u, 1 / alpha) /
        (this.sampleGamma(alpha + 1, 1) * Math.pow(u, 1 / alpha) + this.sampleGamma(beta, 1));
    }

    const x = this.sampleGamma(alpha, 1);
    const y = this.sampleGamma(beta, 1);
    return x / (x + y);
  }

  private sampleGamma(shape: number, scale: number): number {
    // Marsaglia-Tsang algorithm
    if (shape < 1) {
      return this.sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        x = this.randn();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();
      
      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v * scale;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }

  private randn(): number {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  private async persistState(
    pageId: string, category: string, hour: number,
    alpha: number, beta: number,
  ): Promise<void> {
    try {
      const sampleCount = Math.round((alpha + beta - 10) / this.WEIGHT); // subtract priors
      await query(
        `INSERT INTO bayesian_state (page_id, category, hour, alpha, beta, sample_count, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (page_id, category, hour) DO UPDATE SET
           alpha = $4, beta = $5, sample_count = $6, last_updated = NOW()`,
        [pageId, category, hour, alpha, beta, sampleCount]
      );

      // Also update Redis cache (TTL 24h)
      const rkey = `bayesian:${pageId}:${category}`;
      await this.redis.hset(rkey, `${hour}`, JSON.stringify({ alpha, beta }));
      await this.redis.expire(rkey, 86400);
    } catch (err: any) {
      logger.warn({ error: err.message, pageId, category, hour }, 'BayesianOptimizer: erro ao persistir');
    }
  }

  /**
   * Get stats for dashboard.
   */
  async getStats(): Promise<{
    totalStates: number;
    categories: string[];
    avgConfidence: number;
  }> {
    try {
      const result = await query(
        `SELECT COUNT(*) as cnt, 
                COUNT(DISTINCT category) as cats,
                AVG(alpha / (alpha + beta)) as avg_mean
         FROM bayesian_state`
      );

      const catsResult = await query('SELECT DISTINCT category FROM bayesian_state');

      return {
        totalStates: parseInt(result.rows[0]?.cnt || '0'),
        categories: catsResult.rows.map((r: any) => r.category),
        avgConfidence: parseFloat(result.rows[0]?.avg_mean || '0'),
      };
    } catch {
      return { totalStates: 0, categories: [], avgConfidence: 0 };
    }
  }
}

// =====================================================================
// Singleton
// =====================================================================

export const bayesianOptimizer = new BayesianOptimizer();
