/**
 * Memory Manager
 * Camada de memória evolutiva para o Conselho Pattern
 * Sprint 0 - Story 2: Weaviate prep + PostgreSQL-based learning
 * 
 * Fase 1: PostgreSQL-backed (agora)
 * Fase 2: Weaviate vector embeddings (Sprint 1+)
 */

import { Pool } from 'pg'; // type only, pool managed by db/client.ts
import { query, getPool } from '../db/client';
import { logger } from '../lib/logger';

export interface MemoryEntry {
  id: string;
  postId: string;
  platform: string;
  category: string;
  publishedAt: Date;
  hourOfDay: number;
  dayOfWeek: number;
  engagementRate: number;
  impressions: number;
  councilScore: number;
  councilAccuracy: number; // predicted vs actual
  timingScore: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface TimingPattern {
  category: string;
  platform: string;
  hourOfDay: number;
  dayOfWeek: number;
  avgEngagementRate: number;
  sampleSize: number;
  confidence: number;
  lastUpdated: Date;
}

export interface LearningState {
  totalEntries: number;
  accuracy: number;
  lastRetrainedAt: Date | null;
  patternsCount: number;
  biasScore: number;
  mode: 'conservative' | 'moderate' | 'aggressive';
}

const dbPool = getPool();

/**
 * Initialize memory tables (idempotent)
 */
export async function initMemoryTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id VARCHAR(255) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      category VARCHAR(100) NOT NULL,
      published_at TIMESTAMPTZ NOT NULL,
      hour_of_day INT NOT NULL,
      day_of_week INT NOT NULL,
      engagement_rate REAL DEFAULT 0,
      impressions INT DEFAULT 0,
      council_score REAL DEFAULT 0,
      council_accuracy REAL DEFAULT 0,
      timing_score REAL DEFAULT 0,
      tags TEXT[] DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, platform)
    );

    CREATE INDEX IF NOT EXISTS idx_memory_category_platform 
      ON memory_entries(category, platform);
    CREATE INDEX IF NOT EXISTS idx_memory_timing 
      ON memory_entries(hour_of_day, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_memory_published 
      ON memory_entries(published_at DESC);

    CREATE TABLE IF NOT EXISTS timing_patterns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category VARCHAR(100) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      hour_of_day INT NOT NULL,
      day_of_week INT NOT NULL,
      avg_engagement_rate REAL DEFAULT 0,
      sample_size INT DEFAULT 0,
      confidence REAL DEFAULT 0,
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(category, platform, hour_of_day, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS council_decisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id VARCHAR(255) NOT NULL,
      architect_score REAL NOT NULL,
      architect_rationale TEXT,
      strategist_score REAL NOT NULL,
      strategist_rationale TEXT,
      operator_score REAL NOT NULL,
      operator_rationale TEXT,
      consensus_score REAL NOT NULL,
      scheduled_at TIMESTAMPTZ,
      actual_engagement_rate REAL,
      accuracy_score REAL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_council_post 
      ON council_decisions(post_id);
    CREATE INDEX IF NOT EXISTS idx_council_created 
      ON council_decisions(created_at DESC);

    CREATE TABLE IF NOT EXISTS learning_state (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      total_entries INT DEFAULT 0,
      accuracy REAL DEFAULT 0,
      last_retrained_at TIMESTAMPTZ,
      patterns_count INT DEFAULT 0,
      bias_score REAL DEFAULT 0,
      mode VARCHAR(20) DEFAULT 'moderate',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO learning_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);

  logger.info({}, 'Memory tables initialized');
}

/**
 * Record a publish event for learning
 */
export async function recordPublishEvent(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<void> {
  const db = getPool();

  try {
    await db.query(`
      INSERT INTO memory_entries 
        (post_id, platform, category, published_at, hour_of_day, day_of_week,
         engagement_rate, impressions, council_score, council_accuracy, timing_score, tags, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (post_id, platform) 
      DO UPDATE SET 
        engagement_rate = EXCLUDED.engagement_rate,
        impressions = EXCLUDED.impressions,
        council_accuracy = EXCLUDED.council_accuracy
    `, [
      entry.postId, entry.platform, entry.category, entry.publishedAt,
      entry.hourOfDay, entry.dayOfWeek, entry.engagementRate, entry.impressions,
      entry.councilScore, entry.councilAccuracy, entry.timingScore,
      entry.tags, JSON.stringify(entry.metadata),
    ]);

    logger.debug({ postId: entry.postId, platform: entry.platform }, 'Memory entry recorded');
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, postId: entry.postId }, 'Failed to record memory entry');
  }
}

/**
 * Record council decision for audit trail
 */
export async function recordCouncilDecision(decision: {
  postId: string;
  architectScore: number;
  architectRationale: string;
  strategistScore: number;
  strategistRationale: string;
  operatorScore: number;
  operatorRationale: string;
  consensusScore: number;
  scheduledAt: Date;
}): Promise<void> {
  const db = getPool();

  try {
    await db.query(`
      INSERT INTO council_decisions 
        (post_id, architect_score, architect_rationale, strategist_score, strategist_rationale,
         operator_score, operator_rationale, consensus_score, scheduled_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      decision.postId, decision.architectScore, decision.architectRationale,
      decision.strategistScore, decision.strategistRationale,
      decision.operatorScore, decision.operatorRationale,
      decision.consensusScore, decision.scheduledAt,
    ]);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, postId: decision.postId }, 'Failed to record council decision');
  }
}

/**
 * Update engagement data for accuracy tracking
 */
export async function updateEngagementData(postId: string, actualEngagement: number): Promise<void> {
  const db = getPool();

  try {
    // Update council decision with actual engagement
    await db.query(`
      UPDATE council_decisions 
      SET actual_engagement_rate = $2,
          accuracy_score = CASE 
            WHEN consensus_score > 0 THEN 1.0 - ABS(consensus_score - ($2 / 10.0))
            ELSE 0
          END
      WHERE post_id = $1 AND actual_engagement_rate IS NULL
    `, [postId, actualEngagement]);

    // Update memory entry
    await db.query(`
      UPDATE memory_entries 
      SET engagement_rate = $2,
          council_accuracy = (
            SELECT accuracy_score FROM council_decisions 
            WHERE post_id = $1 ORDER BY created_at DESC LIMIT 1
          )
      WHERE post_id = $1
    `, [postId, actualEngagement]);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, postId }, 'Failed to update engagement data');
  }
}

/**
 * Recompute timing patterns from historical data
 * Called periodically (every 6 hours per Conselho decision)
 */
export async function recomputeTimingPatterns(): Promise<number> {
  const db = getPool();

  try {
    const result = await db.query(`
      INSERT INTO timing_patterns (category, platform, hour_of_day, day_of_week, 
        avg_engagement_rate, sample_size, confidence, last_updated)
      SELECT 
        category,
        platform,
        hour_of_day,
        day_of_week,
        AVG(engagement_rate) as avg_eng,
        COUNT(*) as samples,
        LEAST(1.0, COUNT(*)::real / 30.0) as confidence,
        NOW()
      FROM memory_entries
      WHERE engagement_rate > 0
        AND published_at > NOW() - INTERVAL '90 days'
      GROUP BY category, platform, hour_of_day, day_of_week
      HAVING COUNT(*) >= 3
      ON CONFLICT (category, platform, hour_of_day, day_of_week)
      DO UPDATE SET
        avg_engagement_rate = EXCLUDED.avg_engagement_rate,
        sample_size = EXCLUDED.sample_size,
        confidence = EXCLUDED.confidence,
        last_updated = EXCLUDED.last_updated
      RETURNING id
    `);

    const patternsCount = result.rowCount || 0;

    // Update learning state
    await updateLearningState();

    logger.info({ patternsUpdated: patternsCount }, 'Timing patterns recomputed');
    return patternsCount;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Failed to recompute timing patterns');
    return 0;
  }
}

/**
 * Get best timing for a category/platform combo
 */
export async function getBestTiming(category: string, platform: string): Promise<TimingPattern | null> {
  const db = getPool();

  try {
    const result = await db.query(`
      SELECT * FROM timing_patterns
      WHERE category = $1 AND platform = $2
        AND confidence >= 0.5
      ORDER BY avg_engagement_rate DESC
      LIMIT 1
    `, [category, platform]);

    if (result.rows.length === 0) return null;

    const r = result.rows[0];
    return {
      category: r.category,
      platform: r.platform,
      hourOfDay: r.hour_of_day,
      dayOfWeek: r.day_of_week,
      avgEngagementRate: r.avg_engagement_rate,
      sampleSize: r.sample_size,
      confidence: r.confidence,
      lastUpdated: r.last_updated,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Failed to get best timing');
    return null;
  }
}

/**
 * Get similar posts for the Strategist specialist
 * Phase 1: PostgreSQL-based similarity (category + timing)
 * Phase 2: Will use Weaviate vector similarity
 */
export async function getSimilarPosts(category: string, platform: string, limit: number = 10): Promise<MemoryEntry[]> {
  const db = getPool();

  try {
    const result = await db.query(`
      SELECT * FROM memory_entries
      WHERE category = $1 AND platform = $2
        AND engagement_rate > 0
      ORDER BY published_at DESC
      LIMIT $3
    `, [category, platform, limit]);

    return result.rows.map(r => ({
      id: r.id,
      postId: r.post_id,
      platform: r.platform,
      category: r.category,
      publishedAt: r.published_at,
      hourOfDay: r.hour_of_day,
      dayOfWeek: r.day_of_week,
      engagementRate: r.engagement_rate,
      impressions: r.impressions,
      councilScore: r.council_score,
      councilAccuracy: r.council_accuracy,
      timingScore: r.timing_score,
      tags: r.tags || [],
      metadata: r.metadata || {},
      createdAt: r.created_at,
    }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Failed to get similar posts');
    return [];
  }
}

/**
 * Bias audit - check if Conselho is biased
 * Called hourly per Conselho decision
 */
export async function auditBias(): Promise<{ biasScore: number; issues: string[] }> {
  const db = getPool();
  const issues: string[] = [];

  try {
    // Check category distribution bias
    const categoryResult = await db.query(`
      SELECT category, COUNT(*) as count,
        AVG(council_score) as avg_score
      FROM memory_entries
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY category
    `);

    const categories = categoryResult.rows;
    if (categories.length > 0) {
      const avgScore = categories.reduce((sum, c) => sum + parseFloat(c.avg_score), 0) / categories.length;
      const maxDeviation = Math.max(...categories.map(c => Math.abs(parseFloat(c.avg_score) - avgScore)));

      if (maxDeviation > 3) {
        issues.push(`High category bias detected: max deviation ${maxDeviation.toFixed(1)} from mean`);
      }
    }

    // Check timing pattern concentration
    const timingResult = await db.query(`
      SELECT hour_of_day, COUNT(*) as count
      FROM memory_entries
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY hour_of_day
      ORDER BY count DESC
      LIMIT 3
    `);

    if (timingResult.rows.length > 0) {
      const topHourCount = parseInt(timingResult.rows[0]?.count || '0');
      const totalCount = timingResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
      if (totalCount > 0 && topHourCount / totalCount > 0.5) {
        issues.push(`Timing concentration bias: ${((topHourCount / totalCount) * 100).toFixed(0)}% posts in hour ${timingResult.rows[0].hour_of_day}`);
      }
    }

    // Check council accuracy trend
    const accuracyResult = await db.query(`
      SELECT AVG(accuracy_score) as avg_accuracy
      FROM council_decisions
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND accuracy_score IS NOT NULL
    `);

    const accuracy = parseFloat(accuracyResult.rows[0]?.avg_accuracy || '0');
    if (accuracy < 0.6 && accuracy > 0) {
      issues.push(`Low council accuracy: ${(accuracy * 100).toFixed(0)}% (threshold: 60%)`);
    }

    const biasScore = issues.length === 0 ? 0 : Math.min(1, issues.length * 0.3);

    logger.info({ biasScore, issues: issues.length }, 'Bias audit completed');
    return { biasScore, issues };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Bias audit failed');
    return { biasScore: 0, issues: [`Audit error: ${errMsg}`] };
  }
}

/**
 * Update learning state
 */
async function updateLearningState(): Promise<void> {
  const db = getPool();

  try {
    await db.query(`
      UPDATE learning_state SET
        total_entries = (SELECT COUNT(*) FROM memory_entries),
        accuracy = COALESCE(
          (SELECT AVG(accuracy_score) FROM council_decisions 
           WHERE accuracy_score IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'),
          0
        ),
        last_retrained_at = NOW(),
        patterns_count = (SELECT COUNT(*) FROM timing_patterns),
        bias_score = COALESCE(
          (SELECT CASE 
            WHEN COUNT(DISTINCT category) > 0 
            THEN STDDEV(council_score) / GREATEST(AVG(council_score), 0.01)
            ELSE 0 
          END FROM memory_entries WHERE created_at > NOW() - INTERVAL '24 hours'),
          0
        ),
        mode = CASE
          WHEN (SELECT AVG(accuracy_score) FROM council_decisions 
                WHERE accuracy_score IS NOT NULL AND created_at > NOW() - INTERVAL '7 days') > 0.75
          THEN 'aggressive'
          WHEN (SELECT AVG(accuracy_score) FROM council_decisions 
                WHERE accuracy_score IS NOT NULL AND created_at > NOW() - INTERVAL '7 days') < 0.6
          THEN 'conservative'
          ELSE 'moderate'
        END,
        updated_at = NOW()
      WHERE id = 1
    `);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Failed to update learning state');
  }
}

/**
 * Get current learning state
 */
export async function getLearningState(): Promise<LearningState> {
  const db = getPool();

  try {
    const result = await db.query('SELECT * FROM learning_state WHERE id = 1');
    const r = result.rows[0];

    if (!r) {
      return {
        totalEntries: 0,
        accuracy: 0,
        lastRetrainedAt: null,
        patternsCount: 0,
        biasScore: 0,
        mode: 'moderate',
      };
    }

    return {
      totalEntries: r.total_entries,
      accuracy: r.accuracy,
      lastRetrainedAt: r.last_retrained_at,
      patternsCount: r.patterns_count,
      biasScore: r.bias_score,
      mode: r.mode,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Failed to get learning state');
    return {
      totalEntries: 0,
      accuracy: 0,
      lastRetrainedAt: null,
      patternsCount: 0,
      biasScore: 0,
      mode: 'moderate',
    };
  }
}

/**
 * Reset embeddings (when accuracy < 60%)
 * Per Conselho decision: moderate + adaptativa
 */
export async function resetMemory(keepDays: number = 30): Promise<void> {
  const db = getPool();

  try {
    // Only delete old data, keep recent
    await db.query(`
      DELETE FROM memory_entries WHERE created_at < NOW() - INTERVAL '${keepDays} days'
    `);
    await db.query('DELETE FROM timing_patterns');
    await recomputeTimingPatterns();

    logger.warn({ keepDays }, 'Memory reset executed - old entries purged, patterns recomputed');
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Memory reset failed');
  }
}

/**
 * Cleanup — no-op: pool is centrally managed by db/client.ts
 */
export async function closeMemoryPool(): Promise<void> {
  // Pool is managed centrally by db/client.ts
}
