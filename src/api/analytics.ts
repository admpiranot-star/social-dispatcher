/**
 * Analytics API
 * Endpoints para relatórios e análises de performance
 * P0 #8: Zod validation em todos os query params
 */

import { Hono } from 'hono';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { query } from '../db/client';
import { engagementAggregator } from '../engagement/aggregator';
import { timingOptimizer } from '../lib/timing-optimizer';
import { AnalyticsQuerySchema, TrendingQuerySchema, formatZodError } from '../types/validation';

export const analyticsRouter = new Hono();

/**
 * GET /analytics/performance
 * Performance geral dos últimos dias
 */
analyticsRouter.get('/analytics/performance', async (c) => {
  try {
    const { days } = AnalyticsQuerySchema.parse({ days: c.req.query('days') });

    const result = await query(
      `
      SELECT
        DATE(p.created_at AT TIME ZONE 'America/Sao_Paulo') as date,
        COUNT(p.id) as posts_published,
        AVG(
          CASE WHEN e.impressions > 0
            THEN ((e.likes + e.comments + e.shares) / e.impressions) * 100
            ELSE 0
          END
        ) as avg_engagement_rate,
        SUM(e.likes) as total_likes,
        SUM(e.comments) as total_comments,
        SUM(e.shares) as total_shares,
        SUM(e.impressions) as total_impressions
      FROM posts p
      LEFT JOIN engagement_events e ON p.id = e.post_id
      WHERE p.created_at > NOW() - $1::INTERVAL
      AND p.status = 'published'
      GROUP BY DATE(p.created_at AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY date DESC
    `,
      [`${days} days`]
    );

    const total = await query(
      `
      SELECT
        COUNT(p.id) as total_posts,
        AVG(
          CASE WHEN e.impressions > 0
            THEN ((e.likes + e.comments + e.shares) / e.impressions) * 100
            ELSE 0
          END
        ) as overall_engagement
      FROM posts p
      LEFT JOIN engagement_events e ON p.id = e.post_id
      WHERE p.created_at > NOW() - $1::INTERVAL
      AND p.status = 'published'
    `,
      [`${days} days`]
    );

    return c.json({
      period: `${days} dias`,
      timestamp: new Date().toISOString(),
      summary: {
        totalPosts: parseInt(total.rows[0]?.total_posts || '0'),
        overallEngagement: parseFloat(total.rows[0]?.overall_engagement || '0').toFixed(2) + '%',
      },
      daily: result.rows.map((row: Record<string, string | null>) => ({
        date: row.date,
        postsPublished: parseInt(row.posts_published || '0'),
        avgEngagement: parseFloat(row.avg_engagement_rate || '0').toFixed(2) + '%',
        metrics: {
          likes: parseInt(row.total_likes || '0'),
          comments: parseInt(row.total_comments || '0'),
          shares: parseInt(row.total_shares || '0'),
          impressions: parseInt(row.total_impressions || '0'),
        },
      })),
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Analytics error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /analytics/by-category
 * Análise segmentada por categoria
 */
analyticsRouter.get('/analytics/by-category', async (c) => {
  try {
    const { days } = AnalyticsQuerySchema.parse({ days: c.req.query('days') || '30' });

    const result = await query(
      `
      SELECT
        p.category,
        COUNT(p.id) as posts_published,
        AVG(
          CASE WHEN e.impressions > 0
            THEN ((e.likes + e.comments + e.shares) / e.impressions) * 100
            ELSE 0
          END
        ) as avg_engagement_rate,
        SUM(e.impressions) as total_impressions,
        SUM(e.likes + e.comments + e.shares) as total_interactions
      FROM posts p
      LEFT JOIN engagement_events e ON p.id = e.post_id
      WHERE p.created_at > NOW() - $1::INTERVAL
      AND p.status = 'published'
      GROUP BY p.category
      ORDER BY avg_engagement_rate DESC
    `,
      [`${days} days`]
    );

    return c.json({
      period: `${days} dias`,
      timestamp: new Date().toISOString(),
      categories: result.rows.map((row: Record<string, string | null>) => ({
        category: row.category,
        postsPublished: parseInt(row.posts_published || '0'),
        avgEngagement: parseFloat(row.avg_engagement_rate || '0').toFixed(2) + '%',
        totalImpressions: parseInt(row.total_impressions || '0'),
        totalInteractions: parseInt(row.total_interactions || '0'),
      })),
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Category analytics error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /analytics/by-platform
 * Análise segmentada por plataforma
 */
analyticsRouter.get('/analytics/by-platform', async (c) => {
  try {
    const { days } = AnalyticsQuerySchema.parse({ days: c.req.query('days') || '30' });

    const result = await query(
      `
      SELECT
        j.channel,
        COUNT(DISTINCT j.post_id) as posts_published,
        COUNT(CASE WHEN j.status = 'published' THEN 1 END) as successful_publishes,
        COUNT(CASE WHEN j.status = 'failed' THEN 1 END) as failed_publishes,
        AVG(j.duration_ms) as avg_duration_ms
      FROM job_logs j
      WHERE j.created_at > NOW() - $1::INTERVAL
      GROUP BY j.channel
      ORDER BY posts_published DESC
    `,
      [`${days} days`]
    );

    return c.json({
      period: `${days} dias`,
      timestamp: new Date().toISOString(),
      platforms: result.rows.map((row: Record<string, string | null>) => ({
        platform: row.channel,
        postsPublished: parseInt(row.posts_published || '0'),
        successfulPublishes: parseInt(row.successful_publishes || '0'),
        failedPublishes: parseInt(row.failed_publishes || '0'),
        successRate: (
          (parseInt(row.successful_publishes || '0') / parseInt(row.posts_published || '1')) *
          100
        ).toFixed(1) + '%',
        avgPublishTime: parseInt(row.avg_duration_ms || '0') + 'ms',
      })),
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Platform analytics error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /analytics/timing
 * Recomendações de timing baseadas em ML
 */
analyticsRouter.get('/analytics/timing', async (c) => {
  try {
    const stats = await timingOptimizer.getOptimizationStats();

    return c.json({
      timestamp: new Date().toISOString(),
      message: 'Timing otimizado baseado em histórico de engagement',
      ...stats,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Timing analytics error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /analytics/trending
 * Top posts com alto engagement
 */
analyticsRouter.get('/analytics/trending', async (c) => {
  try {
    const { limit } = TrendingQuerySchema.parse({ limit: c.req.query('limit') });

    const trending = await engagementAggregator.getTrendingPosts(limit);

    return c.json({
      timestamp: new Date().toISOString(),
      period: 'Últimos 30 minutos',
      trendingPosts: trending,
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Trending analytics error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /analytics/schedule-health
 * Saúde do sistema de agendamento
 */
analyticsRouter.get('/analytics/schedule-health', async (c) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_scheduled,
        COUNT(CASE WHEN scheduled_at <= NOW() THEN 1 END) as overdue,
        COUNT(CASE WHEN scheduled_at > NOW() AND scheduled_at <= NOW() + INTERVAL '1 hour' THEN 1 END) as next_hour,
        COUNT(CASE WHEN scheduled_at > NOW() + INTERVAL '1 hour' THEN 1 END) as future
      FROM queue_state
      WHERE scheduled_at > NOW() - INTERVAL '7 days'
    `);

    const row = result.rows[0] as Record<string, string>;

    return c.json({
      timestamp: new Date().toISOString(),
      scheduleHealth: {
        totalScheduled: parseInt(row.total_scheduled),
        overdue: parseInt(row.overdue),
        nextHour: parseInt(row.next_hour),
        future: parseInt(row.future),
        healthScore:
          parseInt(row.overdue) === 0
            ? 'Excelente'
            : parseInt(row.overdue) < 5
              ? 'Bom'
              : 'Critico',
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Schedule health error');
    return c.json({ error: errMsg }, 500);
  }
});

/**
 * GET /analytics/export/csv
 * Exportar relatório em CSV
 */
analyticsRouter.get('/analytics/export/csv', async (c) => {
  try {
    const { days } = AnalyticsQuerySchema.parse({ days: c.req.query('days') });

    const result = await query(
      `
      SELECT
        p.id,
        p.title,
        p.category,
        p.created_at,
        j.channel,
        j.status,
        e.likes,
        e.comments,
        e.shares,
        e.impressions
      FROM posts p
      LEFT JOIN job_logs j ON p.id = j.post_id
      LEFT JOIN engagement_events e ON p.id = e.post_id
      WHERE p.created_at > NOW() - $1::INTERVAL
      ORDER BY p.created_at DESC
      LIMIT 5000
    `,
      [`${days} days`]
    );

    // Gerar CSV
    const headers = ['ID', 'Titulo', 'Categoria', 'Data', 'Plataforma', 'Status', 'Likes', 'Comentarios', 'Compartilhamentos', 'Impressoes'];
    const rows = result.rows.map((row: Record<string, string | number | null>) =>
      [
        row.id,
        `"${String(row.title).replace(/"/g, '""')}"`,
        row.category,
        new Date(String(row.created_at)).toLocaleString('pt-BR'),
        row.channel,
        row.status,
        row.likes || 0,
        row.comments || 0,
        row.shares || 0,
        row.impressions || 0,
      ].join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="analytics-${days}d-${Date.now()}.csv"`);

    return c.text(csv);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return c.json(formatZodError(err), 400);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'CSV export error');
    return c.json({ error: errMsg }, 500);
  }
});
