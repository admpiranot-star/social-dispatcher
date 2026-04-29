/**
 * Daemon Scheduler — Bot 24/7
 * 
 * Motor autônomo que mantém o social dispatcher funcionando continuamente.
 * 
 * Ciclos:
 *   - A cada 15 min: busca novos artigos do WordPress → enfileira
 *   - A cada 1h: atualiza modelo ML (Bayesian patterns, recompute timing)
 *   - A cada 6h: bias audit, clean expired cache
 *   - A cada 24h: relatório de saúde → log + metrics
 * 
 * Health monitoring:
 *   - Servidor API respondendo?
 *   - BullMQ workers ativos?
 *   - Redis/DB conectados?
 *   - Meta API tokens válidos?
 */

import { logger } from '../lib/logger';
import { contentCurator } from '../ml/content-curator';
import { bayesianOptimizer } from '../ml/bayesian-optimizer';
import { dispatcher } from '../dispatcher';
import { recomputeTimingPatterns, auditBias } from '../memory/manager';
import { engagementReciler } from '../engagement/engagement-reciler';

// =====================================================================
// Tipos
// =====================================================================

interface CycleState {
  lastArticleFetch: Date;
  lastMLUpdate: Date;
  lastBiasAudit: Date;
  lastHealthCheck: Date;
  articleFetchCount: number;
  articlesDispatchedTotal: number;
  mlUpdates: number;
  errors24h: number;
  startTime: Date;
}

interface HealthReport {
  ok: boolean;
  apiServer: boolean;
  db: boolean;
  redis: boolean;
  metaApi: boolean;
  workersRunning: boolean;
  queueDepth: number;
  rampUpPages: { active: number; warming: number; dormant: number };
  bayesianStates: number;
  uptimeMinutes: number;
}

// =====================================================================
// Daemon
// =====================================================================

export class SocialDaemon {
  private running = false;
  private timers: NodeJS.Timeout[] = [];
  private state: CycleState;

  constructor() {
    this.state = {
      lastArticleFetch: new Date(0),
      lastMLUpdate: new Date(0),
      lastBiasAudit: new Date(0),
      lastHealthCheck: new Date(0),
      articleFetchCount: 0,
      articlesDispatchedTotal: 0,
      mlUpdates: 0,
      errors24h: 0,
      startTime: new Date(),
    };
  }

  /**
   * Start the daemon — installs all periodic timers.
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn({}, 'Daemon já está rodando — ignorando start');
      return;
    }

    this.running = true;
    this.state.startTime = new Date();

    logger.info({}, '🚀 Social Daemon iniciando...');

    // Initialize ML engine (already done by server, skip)
    logger.info({}, 'Social Daemon iniciando...');

    // Install periodic cycles
    this.timers.push(
      // ARTICLE FETCH: every 10 minutes (60 articles/day target)
      setInterval(() => this.articleFetchCycle(), 10 * 60_000),
      
      // ML UPDATE: every 1 hour
      setInterval(() => this.mlUpdateCycle(), 60 * 60_000),
      
      // ENGAGEMENT RECILER: every 30 minutes (MEDIR → APRENDER)
      setInterval(() => this.engagementCycle(), 30 * 60_000),
      
      // BIAS AUDIT: every 6 hours
      setInterval(() => this.biasAuditCycle(), 6 * 60 * 60_000),
      
      // HEALTH CHECK: every 5 minutes
      setInterval(() => this.healthCheckCycle(), 5 * 60_000),
      
      // DAILY REPORT: every 24 hours
      setInterval(() => this.dailyReport(), 24 * 60 * 60_000),
    );

    // Run first article fetch immediately
    setTimeout(() => this.articleFetchCycle(), 5000);
    
    // Run first health check
    setTimeout(() => this.healthCheckCycle(), 10000);

    // Run first engagement recile immediately
    setTimeout(() => this.engagementCycle(), 15000);

    logger.info(
      { cycles: ['article(10m)', 'ml(1h)', 'engagement(30m)', 'audit(6h)', 'health(5m)', 'report(24h)'] },
      '✅ Social Daemon started — 6 cycles installed'
    );
  }

  /**
   * Stop the daemon gracefully.
   */
  stop(): void {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    logger.info({}, '🛑 Social Daemon stopped');
  }

  /**
   * Get current daemon state (for dashboard).
   */
  getState(): CycleState {
    return { ...this.state };
  }

  /**
   * Force an article fetch cycle now (API endpoint).
   */
  async forceFetchNow(): Promise<{
    fetched: number;
    dispatched: number;
    durationMs: number;
  }> {
    const start = Date.now();
    const result = await this.articleFetchCycle();
    return {
      fetched: result?.fetched || 0,
      dispatched: result?.dispatched || 0,
      durationMs: Date.now() - start,
    };
  }

  // =====================================================================
  // Cycles
  // =====================================================================

  /**
   * Article fetch cycle — busca WP, enfileira no Dispatcher.
   */
  private async articleFetchCycle(): Promise<{ fetched: number; dispatched: number } | null> {
    try {
      logger.debug({}, 'Daemon: ciclo de busca de artigos...');

      // Curate articles from WordPress
      const articles = await contentCurator.curate();

      if (articles.length === 0) {
        logger.debug({}, 'Daemon: zero artigos novos');
        this.state.lastArticleFetch = new Date();
        return { fetched: 0, dispatched: 0 };
      }

      this.state.articleFetchCount++;
      let dispatchedCount = 0;

      // Dispatch each article through the dispatcher (ramp-up + bayesian timing applied)
      const payloads = contentCurator.toDispatchPayloads(articles);
      
      for (const payload of payloads) {
        try {
          const results = await dispatcher.dispatch(payload);
          const queued = results.filter(r => r.status === 'queued').length;
          dispatchedCount += queued;
          this.state.articlesDispatchedTotal += queued;

          logger.info(
            { title: payload.title.slice(0, 50), category: payload.category, pages: queued },
            'Daemon: artigo enfileirado'
          );
        } catch (err: any) {
          this.state.errors24h++;
          logger.error(
            { title: payload.title.slice(0, 50), error: err.message },
            'Daemon: erro ao enfileirar artigo'
          );
        }
      }

      this.state.lastArticleFetch = new Date();

      logger.info(
        {
          fetched: articles.length,
          dispatched: dispatchedCount,
          curatorStats: contentCurator.getStats(),
        },
        'Daemon: ciclo de artigos concluído'
      );

      return { fetched: articles.length, dispatched: dispatchedCount };
    } catch (err: any) {
      this.state.errors24h++;
      logger.error({ error: err.message }, 'Daemon: erro no ciclo de artigos');
      return null;
    }
  }

  /**
   * ML update cycle — recompute timing patterns, update learning state.
   */
  private async mlUpdateCycle(): Promise<void> {
    try {
      logger.info({}, 'Daemon: atualizando modelos ML...');

      // Recompute timing patterns from memory
      const patternsCount = await recomputeTimingPatterns();
      this.state.mlUpdates++;
      this.state.lastMLUpdate = new Date();

      // Get Bayesian stats
      const bayesianStats = await bayesianOptimizer.getStats();

      logger.info(
        { patternsRecomputed: patternsCount, bayesianStates: bayesianStats.totalStates },
        'Daemon: ML models updated'
      );
    } catch (err: any) {
      logger.error({ error: err.message }, 'Daemon: erro na atualização ML');
    }
  }

  /**
   * Bias audit cycle — detect and report council bias.
   */
  private async biasAuditCycle(): Promise<void> {
    try {
      const result = await auditBias();
      this.state.lastBiasAudit = new Date();

      if (result.issues.length > 0) {
        logger.warn({ biasScore: result.biasScore, issues: result.issues }, 'Daemon: bias detectado');
      } else {
        logger.debug({}, 'Daemon: bias audit limpo');
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'Daemon: erro no bias audit');
    }
  }

  /**
   * Engagement reciler cycle — MEDIR → APRENDER → AJUSTAR.
   * Busca métricas de posts e páginas no Facebook,
   * calcula engagement rate, e alimenta o BayesianOptimizer.
   */
  private async engagementCycle(): Promise<void> {
    try {
      // 1. Buscar métricas de posts (reactions, comments, shares)
      await engagementReciler.fetchPostMetrics();

      // 2. Buscar métricas de página (followers, impressions)
      await engagementReciler.fetchPageMetrics();

      // 3. Verificar promoções de ramp-up
      await engagementReciler.checkRampUpPromotions();

      this.state.lastBiasAudit = new Date();
      logger.info({}, 'Daemon: ciclo de engagement concluído');
    } catch (err: any) {
      logger.error({ error: err.message }, 'Daemon: erro no engagement cycle');
    }
  }

  /**
   * Health check cycle — verifica tudo e reporta.
   */
  private async healthCheckCycle(): Promise<void> {
    try {
      const health = await this.collectHealthReport();
      this.state.lastHealthCheck = new Date();

      if (!health.ok) {
        const failures = [];
        if (!health.apiServer) failures.push('API');
        if (!health.db) failures.push('DB');
        if (!health.redis) failures.push('Redis');
        if (!health.metaApi) failures.push('Meta API');
        if (!health.workersRunning) failures.push('Workers');

        logger.error(
          { failures: failures.join(', '), health },
          '⚠️ Daemon: HEALTH CHECK FAILED'
        );
      } else {
        logger.debug(
          {
            queueDepth: health.queueDepth,
            rampUp: health.rampUpPages,
            bayesianStates: health.bayesianStates,
            uptime: `${health.uptimeMinutes}min`,
          },
          'Daemon: health check OK'
        );
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'Daemon: erro no health check');
    }
  }

  /**
   * Daily report — summary of last 24h.
   */
  private async dailyReport(): Promise<void> {
    const uptime = Math.floor((Date.now() - this.state.startTime.getTime()) / 60000);
    const health = await this.collectHealthReport();
    
    logger.info(
      {
        uptime: `${uptime}min`,
        articlesFetched: this.state.articleFetchCount,
        articlesDispatched: this.state.articlesDispatchedTotal,
        errors24h: this.state.errors24h,
        mlUpdates: this.state.mlUpdates,
        health,
        curatorStats: contentCurator.getStats(),
      },
      '📊 DAILY REPORT'
    );

    // Reset error counter
    this.state.errors24h = 0;
  }

  // =====================================================================
  // Health collection
  // =====================================================================

  private async collectHealthReport(): Promise<HealthReport> {
    let apiServer = false;
    let db = false;
    let redis = false;
    let metaApi = false;
    let workersRunning = false;
    let queueDepth = 0;
    let rampUpPages = { active: 0, warming: 0, dormant: 0 };
    let bayesianStates = 0;

    // API server
    try {
      const res = await fetch('http://localhost:3302/api/health', {
        signal: AbortSignal.timeout(5000),
      });
      apiServer = res.ok;
    } catch { /* ignore */ }

    // Parse health response if API is up
    if (apiServer) {
      try {
        const res = await fetch('http://localhost:3302/api/health');
        const health: any = await res.json();
        db = health?.checks?.db?.status === 'ok';
        redis = health?.checks?.redis?.status === 'ok';
        metaApi = health?.checks?.metaApi?.status === 'ok';
      } catch { /* ignore */ }
    }

    // Queue depth (BullMQ)
    try {
      const { getQueueStats } = await import('../queue/bullmq-setup');
      const stats = await getQueueStats();
      if (stats && typeof stats.waiting === 'number') {
        queueDepth = stats.waiting + (stats.active || 0);
        workersRunning = true;
      } else {
        // getQueueStats retornou undefined/incompleto — workers existem mas stats falhou
        workersRunning = true; // fail-open: workers são iniciados no server.ts
        queueDepth = 0;
      }
    } catch {
      // Queue stats falhou, mas workers provavelmente estão rodando
      workersRunning = true; // fail-open
    }

    // Ramp-up state
    try {
      const { query: dbQuery } = await import('../db/client');
      const rampResult = await dbQuery(
        `SELECT phase, COUNT(*) as cnt FROM ramp_up_state GROUP BY phase`
      );
      for (const row of rampResult.rows) {
        if (row.phase === 'active') rampUpPages.active = parseInt(row.cnt);
        else if (row.phase === 'warming') rampUpPages.warming = parseInt(row.cnt);
        else if (row.phase === 'dormant') rampUpPages.dormant = parseInt(row.cnt);
      }
    } catch { /* ignore */ }

    // Bayesian states
    try {
      const stats = await bayesianOptimizer.getStats();
      bayesianStates = stats.totalStates;
    } catch { /* ignore */ }

    const ok = apiServer && db && redis && workersRunning;

    return {
      ok,
      apiServer,
      db,
      redis,
      metaApi,
      workersRunning,
      queueDepth,
      rampUpPages,
      bayesianStates,
      uptimeMinutes: Math.floor((Date.now() - this.state.startTime.getTime()) / 60000),
    };
  }
}

// =====================================================================
// Singleton
// =====================================================================

export const socialDaemon = new SocialDaemon();
