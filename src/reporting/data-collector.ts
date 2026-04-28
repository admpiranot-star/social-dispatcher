/**
 * Report Data Collector
 * Coleta dados do PostgreSQL e Redis para gerar relatórios
 * Sprint 0 - Story 7
 */

import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../lib/logger';
import type { DailyReportData, WeeklyReportData, MonthlyReportData } from './templates';
import { getEnabledPlatforms } from '../config/platforms';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

/**
 * Collect daily report data
 */
export async function collectDailyData(date: Date): Promise<DailyReportData> {
  const dateStr = date.toISOString().split('T')[0];
  const db = getPool();

  try {
    // Total posts dispatched today
    const postsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'published') as successful,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM dispatch_jobs 
      WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = $1
    `, [dateStr]);

    const posts = postsResult.rows[0] || { total: 0, successful: 0, failed: 0 };

    // Engagement metrics
    const engagementResult = await db.query(`
      SELECT 
        COALESCE(SUM(impressions), 0) as total_reach,
        COALESCE(SUM(reactions + shares + comments + clicks), 0) as total_engagement
      FROM post_metrics 
      WHERE DATE(fetched_at AT TIME ZONE 'America/Sao_Paulo') = $1
    `, [dateStr]);

    const metrics = engagementResult.rows[0] || { total_reach: 0, total_engagement: 0 };
    const totalReach = parseInt(metrics.total_reach) || 0;
    const totalEngagement = parseInt(metrics.total_engagement) || 0;
    const engagementRate = totalReach > 0 ? (totalEngagement / totalReach) * 100 : 0;

    // Platform breakdown
    const platformResult = await db.query(`
      SELECT 
        dj.channel as platform,
        COUNT(*) as posts,
        COALESCE(SUM(pm.impressions), 0) as reach,
        COALESCE(SUM(pm.reactions + pm.shares + pm.comments + pm.clicks), 0) as engagement
      FROM dispatch_jobs dj
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id AND dj.channel = pm.platform
      WHERE DATE(dj.created_at AT TIME ZONE 'America/Sao_Paulo') = $1
      GROUP BY dj.channel
      ORDER BY engagement DESC
    `, [dateStr]);

    const platformBreakdown = platformResult.rows.map(r => ({
      platform: String(r.platform),
      posts: parseInt(r.posts) || 0,
      reach: parseInt(r.reach) || 0,
      engagement: parseInt(r.engagement) || 0,
      engagementRate: parseInt(r.reach) > 0
        ? (parseInt(r.engagement) / parseInt(r.reach)) * 100
        : 0,
    }));

    // Top post
    const topPostResult = await db.query(`
      SELECT 
        sp.title, 
        dj.channel as platform,
        COALESCE(pm.reactions + pm.shares + pm.comments, 0) as engagement,
        sp.link
      FROM dispatch_jobs dj
      JOIN social_posts sp ON dj.post_id = sp.id
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id AND dj.channel = pm.platform
      WHERE DATE(dj.created_at AT TIME ZONE 'America/Sao_Paulo') = $1
      ORDER BY engagement DESC
      LIMIT 1
    `, [dateStr]);

    const topPost = topPostResult.rows[0]
      ? {
        title: String(topPostResult.rows[0].title),
        platform: String(topPostResult.rows[0].platform),
        engagement: parseInt(topPostResult.rows[0].engagement) || 0,
        link: String(topPostResult.rows[0].link),
      }
      : null;

    // Issues (failed jobs)
    const issuesResult = await db.query(`
      SELECT channel, error_message 
      FROM dispatch_jobs 
      WHERE status = 'failed' 
        AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [dateStr]);

    const issues = issuesResult.rows.map(r =>
      `[${r.channel}] ${r.error_message || 'Unknown error'}`
    );

    // Council decisions
    const councilResult = await db.query(`
      SELECT 
        COUNT(*) as total_decisions,
        AVG(consensus_score) as avg_accuracy
      FROM council_decisions 
      WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = $1
    `, [dateStr]);

    const council = councilResult.rows[0] || { total_decisions: 0, avg_accuracy: 0 };

    return {
      date: dateStr,
      totalPosts: parseInt(posts.total) || 0,
      successfulPosts: parseInt(posts.successful) || 0,
      failedPosts: parseInt(posts.failed) || 0,
      totalReach,
      totalEngagement,
      engagementRate,
      platformBreakdown,
      topPost,
      issues,
      councilDecisions: parseInt(council.total_decisions) || 0,
      councilAccuracy: parseFloat(council.avg_accuracy) * 100 || 0,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, date: dateStr }, 'Failed to collect daily report data');

    // Return empty data on error
    return {
      date: dateStr,
      totalPosts: 0,
      successfulPosts: 0,
      failedPosts: 0,
      totalReach: 0,
      totalEngagement: 0,
      engagementRate: 0,
      platformBreakdown: [],
      topPost: null,
      issues: [`Data collection error: ${errMsg}`],
      councilDecisions: 0,
      councilAccuracy: 0,
    };
  }
}

/**
 * Collect weekly report data
 */
export async function collectWeeklyData(weekEnd: Date): Promise<WeeklyReportData> {
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const db = getPool();

  // Get daily data for the week aggregate
  const dailyData = await collectDailyData(weekEnd);

  try {
    // Aggregate week data
    const weekResult = await db.query(`
      SELECT 
        COUNT(*) as total_posts,
        COUNT(*) FILTER (WHERE status = 'published') as successful,
        COALESCE(SUM(pm.impressions), 0) as total_reach,
        COALESCE(SUM(pm.reactions + pm.shares + pm.comments + pm.clicks), 0) as total_engagement
      FROM dispatch_jobs dj
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id AND dj.channel = pm.platform
      WHERE dj.created_at >= $1 AND dj.created_at < $2
    `, [weekStart.toISOString(), weekEnd.toISOString()]);

    // Previous week for comparison
    const prevResult = await db.query(`
      SELECT 
        COUNT(*) as total_posts,
        COALESCE(SUM(pm.impressions), 0) as total_reach,
        COALESCE(SUM(pm.reactions + pm.shares + pm.comments + pm.clicks), 0) as total_engagement
      FROM dispatch_jobs dj
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id AND dj.channel = pm.platform
      WHERE dj.created_at >= $1 AND dj.created_at < $2
    `, [prevWeekStart.toISOString(), weekStart.toISOString()]);

    const current = weekResult.rows[0];
    const previous = prevResult.rows[0];
    const currentReach = parseInt(current?.total_reach) || 0;
    const previousReach = parseInt(previous?.total_reach) || 0;
    const currentEngagement = parseInt(current?.total_engagement) || 0;
    const previousEngagement = parseInt(previous?.total_engagement) || 0;
    const currentPosts = parseInt(current?.total_posts) || 0;
    const previousPosts = parseInt(previous?.total_posts) || 0;

    // Trending categories
    const trendingResult = await db.query(`
      SELECT 
        sp.category,
        AVG(pm.reactions + pm.shares + pm.comments) as avg_engagement
      FROM dispatch_jobs dj
      JOIN social_posts sp ON dj.post_id = sp.id
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id
      WHERE dj.created_at >= $1 AND dj.created_at < $2
      GROUP BY sp.category
      ORDER BY avg_engagement DESC
    `, [weekStart.toISOString(), weekEnd.toISOString()]);

    const trendingCategories = trendingResult.rows.map(r => ({
      category: String(r.category),
      growth: 0, // Would compare with previous week
    }));

    // Best timing windows
    const timingResult = await db.query(`
      SELECT 
        EXTRACT(HOUR FROM dj.created_at AT TIME ZONE 'America/Sao_Paulo') as hour,
        dj.channel as platform,
        AVG(CASE WHEN pm.impressions > 0 
          THEN (pm.reactions + pm.shares + pm.comments)::float / pm.impressions * 100 
          ELSE 0 END) as eng_rate
      FROM dispatch_jobs dj
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id AND dj.channel = pm.platform
      WHERE dj.created_at >= $1 AND dj.created_at < $2
        AND dj.status = 'published'
      GROUP BY hour, dj.channel
      ORDER BY eng_rate DESC
      LIMIT 10
    `, [weekStart.toISOString(), weekEnd.toISOString()]);

    const bestTimingWindows = timingResult.rows.map(r => ({
      hour: parseInt(r.hour),
      platform: String(r.platform),
      engagementRate: parseFloat(r.eng_rate) || 0,
    }));

    // Week number calculation
    const startOfYear = new Date(weekEnd.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((weekEnd.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

    return {
      ...dailyData,
      totalPosts: currentPosts,
      totalReach: currentReach,
      totalEngagement: currentEngagement,
      engagementRate: currentReach > 0 ? (currentEngagement / currentReach) * 100 : 0,
      weekNumber,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      trendingCategories,
      bestTimingWindows,
      mlInsights: [
        'Conselho Pattern ativo com 3 especialistas votando',
        `${getEnabledPlatforms().length} plataformas habilitadas`,
      ],
      actionPlan: generateActionPlan(currentReach, previousReach, currentEngagement, previousEngagement),
      comparisonVsPreviousWeek: {
        reachChange: previousReach > 0 ? ((currentReach - previousReach) / previousReach) * 100 : 0,
        engagementChange: previousEngagement > 0 ? ((currentEngagement - previousEngagement) / previousEngagement) * 100 : 0,
        postsChange: previousPosts > 0 ? ((currentPosts - previousPosts) / previousPosts) * 100 : 0,
      },
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Failed to collect weekly data');

    return {
      ...dailyData,
      weekNumber: 0,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      trendingCategories: [],
      bestTimingWindows: [],
      mlInsights: [],
      actionPlan: [`Erro na coleta: ${errMsg}`],
      comparisonVsPreviousWeek: { reachChange: 0, engagementChange: 0, postsChange: 0 },
    };
  }
}

/**
 * Collect monthly report data
 */
export async function collectMonthlyData(monthEnd: Date): Promise<MonthlyReportData> {
  const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
  const weeklyData = await collectWeeklyData(monthEnd);

  const db = getPool();

  try {
    // Previous month comparison
    const prevMonthStart = new Date(monthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

    const prevResult = await db.query(`
      SELECT 
        COALESCE(SUM(pm.impressions), 0) as prev_reach,
        COALESCE(SUM(pm.reactions + pm.shares + pm.comments + pm.clicks), 0) as prev_engagement
      FROM dispatch_jobs dj
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id AND dj.channel = pm.platform
      WHERE dj.created_at >= $1 AND dj.created_at < $2
    `, [prevMonthStart.toISOString(), monthStart.toISOString()]);

    const prev = prevResult.rows[0];
    const prevReach = parseInt(prev?.prev_reach) || 0;
    const prevEngagement = parseInt(prev?.prev_engagement) || 0;

    // Category performance
    const categoryResult = await db.query(`
      SELECT 
        sp.category,
        COUNT(*) as posts,
        AVG(CASE WHEN pm.impressions > 0 
          THEN (pm.reactions + pm.shares + pm.comments)::float / pm.impressions * 100 
          ELSE 0 END) as avg_engagement
      FROM dispatch_jobs dj
      JOIN social_posts sp ON dj.post_id = sp.id
      LEFT JOIN post_metrics pm ON dj.post_id = pm.post_id AND dj.channel = pm.platform
      WHERE dj.created_at >= $1 AND dj.created_at < $2
      GROUP BY sp.category
      ORDER BY avg_engagement DESC
    `, [monthStart.toISOString(), monthEnd.toISOString()]);

    const categoryPerformance = categoryResult.rows.map(r => ({
      category: String(r.category),
      posts: parseInt(r.posts) || 0,
      avgEngagement: parseFloat(r.avg_engagement) || 0,
      trend: 'stable' as const, // Would compare with previous month
    }));

    const monthNames = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    return {
      ...weeklyData,
      month: monthNames[monthEnd.getMonth()],
      year: monthEnd.getFullYear(),
      growthMetrics: {
        impressionsGrowth: prevReach > 0 ? ((weeklyData.totalReach - prevReach) / prevReach) * 100 : 0,
        engagementGrowth: prevEngagement > 0 ? ((weeklyData.totalEngagement - prevEngagement) / prevEngagement) * 100 : 0,
        followersGrowth: 0, // Requires platform API to fetch follower counts
      },
      categoryPerformance,
      timingOptimizationImpact: 0, // Will be calculated when ML is active
      memoryLearningScore: weeklyData.councilAccuracy,
      revenueImpact: {
        estimatedAdRevenue: weeklyData.totalReach * 0.003, // CPM estimate R$3
        timeSaved: weeklyData.totalPosts * 0.25, // 15min saved per post
        timeSavedValue: weeklyData.totalPosts * 0.25 * 200, // R$200/h
      },
      roadmapNextMonth: [
        'Expandir cobertura de plataformas',
        'Refinar timing optimization (ML)',
        'Aumentar cobertura de testes',
        'Implementar A/B testing de captions',
      ],
      risksIdentified: [],
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, 'Failed to collect monthly data');

    return {
      ...weeklyData,
      month: '',
      year: monthEnd.getFullYear(),
      growthMetrics: { impressionsGrowth: 0, engagementGrowth: 0, followersGrowth: 0 },
      categoryPerformance: [],
      timingOptimizationImpact: 0,
      memoryLearningScore: 0,
      revenueImpact: { estimatedAdRevenue: 0, timeSaved: 0, timeSavedValue: 0 },
      roadmapNextMonth: [`Corrigir erro de coleta: ${errMsg}`],
      risksIdentified: [errMsg],
    };
  }
}

/**
 * Generate action plan based on data
 */
function generateActionPlan(
  currentReach: number,
  previousReach: number,
  currentEngagement: number,
  previousEngagement: number
): string[] {
  const plan: string[] = [];

  const reachChange = previousReach > 0 ? ((currentReach - previousReach) / previousReach) * 100 : 0;
  const engChange = previousEngagement > 0 ? ((currentEngagement - previousEngagement) / previousEngagement) * 100 : 0;

  if (reachChange < -10) {
    plan.push('Alcance caiu >10% - revisar timing optimization e horarios de publicacao');
  }
  if (engChange < -10) {
    plan.push('Engajamento caiu >10% - auditar decisoes do Conselho, verificar bias');
  }
  if (reachChange > 15) {
    plan.push('Alcance subiu >15% - manter estrategia atual, explorar mais horarios');
  }
  if (engChange > 15) {
    plan.push('Engajamento subiu >15% - registrar pattern no sistema de memoria evolutiva');
  }

  if (plan.length === 0) {
    plan.push('Metricas estaveis - manter configuracao atual');
    plan.push('Considerar expandir para novas plataformas');
  }

  plan.push('Revisar embeddings do Weaviate (bias check semanal)');

  return plan;
}

/**
 * Cleanup
 */
export async function closeReportPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
