/**
 * Engagement Reciler — Monitora métricas de posts/páginas e alimenta o loop de aprendizado.
 *
 * Ciclo: PUBLICAR → MEDIR (este módulo) → APRENDER (BayesianOptimizer) → AJUSTAR
 *
 * O que faz:
 * 1. A cada 30min: busca reactions/comments/shares dos últimos 25 posts por página
 * 2. A cada 1h: busca métricas de página (followers, impressions)
 * 3. Calcula engagement rate = (reactions + comments + shares) / reach estimado
 * 4. Alimenta o BayesianOptimizer: update(pageId, category, hour, reward)
 * 5. Alimenta o RampUpEngine: se engagement subindo, sobe de fase
 * 6. Persiste tudo em DB para o dashboard e para o Nexus Publisher (ML futuro)
 *
 * NOTA: colunas do DB usam nomes sem aspas (followers, reactions etc. NÃO são
 * palavras reservadas no PostgreSQL 15+). O bug anterior era SQL malformado
 * (ON CONFLICT DO NOTHING seguido de SET), não palavras reservadas.
 */

import { query } from '../db/client';
import { logger } from '../lib/logger';
import { bayesianOptimizer } from '../ml/bayesian-optimizer';
import { getEnabledPages, type PageConfig } from '../config/pages';

// =====================================================================
// Tipos
// =====================================================================

interface PostMetrics {
  platformPostId: string;
  pageId: string;
  pageName: string;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: number;
  createdAt: Date;
}

interface PageMetrics {
  pageId: string;
  pageName: string;
  followerCount: number;
  impressions: number;
  postImpressions: number;
}

interface RecilerStats {
  postsFetched: number;
  postsUpdated: number;
  pagesFetched: number;
  bayesUpdates: number;
  phasePromotions: number;
  errors: number;
  lastRun: Date | null;
}

// =====================================================================
// Engine
// =====================================================================

export class EngagementReciler {
  private stats: RecilerStats = {
    postsFetched: 0,
    postsUpdated: 0,
    pagesFetched: 0,
    bayesUpdates: 0,
    phasePromotions: 0,
    errors: 0,
    lastRun: null,
  };

  /**
   * Buscar métricas de todos os posts recentes e atualizar o DB.
   * Roda a cada 30 minutos.
   */
  async fetchPostMetrics(): Promise<void> {
    const pages = getEnabledPages();
    let totalUpdated = 0;
    let totalFetched = 0;

    for (const page of pages) {
      if (!page.pageToken) continue;

      try {
        const metrics = await this.fetchPagePostsMetrics(page);
        totalFetched += metrics.length;

        for (const m of metrics) {
          await this.updatePostMetrics(m);
          totalUpdated++;
        }

        await this.feedBayesianLearner(metrics);
      } catch (err: any) {
        this.stats.errors++;
        logger.warn({ pageId: page.id, pageName: page.name, error: err.message }, 'EngagementReciler: erro ao buscar métricas da página');
      }
    }

    this.stats.postsFetched += totalFetched;
    this.stats.postsUpdated += totalUpdated;
    this.stats.lastRun = new Date();

    logger.info({
      postsFetched: totalFetched,
      postsUpdated: totalUpdated,
      errors: this.stats.errors,
    }, 'EngagementReciler: ciclo de posts concluído');
  }

  /**
   * Buscar métricas de página (followers, impressions).
   * Roda a cada 1 hora.
   */
  async fetchPageMetrics(): Promise<void> {
    const pages = getEnabledPages();
    let pagesFetched = 0;

    for (const page of pages) {
      if (!page.pageToken) continue;

      try {
        const metrics = await this.fetchSinglePageMetrics(page);
        pagesFetched++;

        // INSERT simples — uma linha por fetch (sem ON CONFLICT complexo)
        await query(
          `INSERT INTO page_metrics (page_id, page_name, followers, impressions, post_impressions, fetched_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [metrics.pageId, metrics.pageName, metrics.followerCount, metrics.impressions, metrics.postImpressions]
        ).catch((err: any) => {
          logger.warn({ error: err.message, pageId: metrics.pageId }, 'EngagementReciler: erro ao salvar page_metrics');
        });
      } catch (err: any) {
        this.stats.errors++;
        logger.warn({ pageId: page.id, error: err.message }, 'EngagementReciler: erro ao buscar métricas de página');
      }
    }

    this.stats.pagesFetched += pagesFetched;
    logger.info({ pagesFetched }, 'EngagementReciler: ciclo de páginas concluído');
  }

  /**
   * Verificar se páginas devem subir de fase no ramp-up.
   * Roda a cada 6 horas.
   * 
   * Atualmente só loga — a transição real é automática via computeState()
   * no ramp-up engine (que usa followers + post count).
   * No futuro, quando tivermos dados suficientes, o engagement rate
   * real vai pesar na decisão de promoção.
   */
  async checkRampUpPromotions(): Promise<void> {
    const pages = getEnabledPages();
    let promotions = 0;

    for (const page of pages) {
      try {
        const result = await query(
          `SELECT AVG(engagement_rate) as avg_rate
           FROM post_metrics
           WHERE page_id = $1
             AND fetched_at > NOW() - INTERVAL '7 days'`,
          [page.id]
        );

        const avgRate = parseFloat(result.rows[0]?.avg_rate || '0');

        // Buscar followers sem chamar API de novo (usa DB)
        const followerResult = await query(
          `SELECT followers FROM page_metrics WHERE page_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
          [page.id]
        );
        const followerCount = parseInt(followerResult.rows[0]?.followers || '0');

        // Lógica de promoção:
        // - se avgRate > 2% e followers > 5K → elegível pra active
        // - se avgRate > 5% e followers > 10K → elegível pra saturated
        if (avgRate > 0.02 && followerCount >= 5000) {
          logger.info({ pageId: page.id, pageName: page.name, avgRate: (avgRate * 100).toFixed(2) + '%', followerCount }, 'EngagementReciler: página elegível para promoção');
          promotions++;
        }
      } catch (err: any) {
        this.stats.errors++;
        logger.warn({ pageId: page.id, error: err.message }, 'EngagementReciler: erro ao verificar promoção');
      }
    }

    this.stats.phasePromotions += promotions;
    logger.info({ promotions }, 'EngagementReciler: verificação de promoções concluída');
  }

  /**
   * Retorna estatísticas para o dashboard.
   */
  getStats(): RecilerStats {
    return { ...this.stats };
  }

  // =====================================================================
  // Internos
  // =====================================================================

  /**
   * Buscar métricas dos últimos 25 posts de uma página via Facebook API.
   */
  private async fetchPagePostsMetrics(page: PageConfig): Promise<PostMetrics[]> {
    const url = `https://graph.facebook.com/v21.0/${page.id}/feed?`
      + `fields=id,message,created_time,shares,`
      + `likes.limit(0).summary(true),`
      + `comments.limit(0).summary(true),`
      + `reactions.limit(0).summary(true)`
      + `&limit=25`
      + `&access_token=${page.pageToken}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'PiraNOT-Dispatcher/2.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Facebook API ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const posts: any[] = data.data || [];
    const results: PostMetrics[] = [];

    for (const post of posts) {
      const reactions = post.reactions?.summary?.total_count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      const shares = post.shares?.count || 0;

      // Engagement rate: se temos engagement, estimamos reach como engagement * 20
      // (regra empírica do Facebook: engagement rate orgânico ~5%)
      const totalEngagement = reactions + comments + shares;
      const estimatedReach = Math.max(totalEngagement * 20, 1);
      const engagementRate = totalEngagement / estimatedReach;

      results.push({
        platformPostId: post.id,
        pageId: page.id,
        pageName: page.name,
        reactions,
        comments,
        shares,
        clicks: 0,
        engagementRate,
        createdAt: new Date(post.created_time),
      });
    }

    return results;
  }

  /**
   * Buscar métricas de uma página (followers, impressions).
   */
  private async fetchSinglePageMetrics(page: PageConfig): Promise<PageMetrics> {
    const pageUrl = `https://graph.facebook.com/v21.0/${page.id}?`
      + `fields=followers_count,fan_count,name`
      + `&access_token=${page.pageToken}`;

    const pageResponse = await fetch(pageUrl, {
      headers: { 'User-Agent': 'PiraNOT-Dispatcher/2.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!pageResponse.ok) {
      throw new Error(`Facebook API ${pageResponse.status}: ${pageResponse.statusText}`);
    }

    const pageData = await pageResponse.json() as any;

    // Impressions (disponível sem app review avançado)
    let impressions = 0;
    let postImpressions = 0;

    try {
      const insightsUrl = `https://graph.facebook.com/v21.0/${page.id}/insights/`
        + `page_impressions_unique,page_posts_impressions`
        + `?period=day&access_token=${page.pageToken}`;

      const insightsResponse = await fetch(insightsUrl, {
        headers: { 'User-Agent': 'PiraNOT-Dispatcher/2.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json() as any;
        for (const entry of (insightsData.data || [])) {
          const lastValue = entry.values?.slice(-1)[0]?.value || 0;
          if (entry.name === 'page_impressions_unique') impressions = lastValue;
          if (entry.name === 'page_posts_impressions') postImpressions = lastValue;
        }
      }
    } catch {
      // Insights podem não estar disponíveis para todas as páginas
    }

    return {
      pageId: page.id,
      pageName: pageData.name || page.name,
      followerCount: pageData.followers_count || pageData.fan_count || page.followers || 0,
      impressions,
      postImpressions,
    };
  }

  /**
   * Atualizar métricas de um post no DB.
   * INSERT puro — dados acumulam para análise temporal.
   */
  private async updatePostMetrics(metrics: PostMetrics): Promise<void> {
    try {
      await query(
        `INSERT INTO post_metrics (
          platform_post_id, page_id, page_name,
          reactions, comments, shares, clicks,
          engagement_rate, created_at, fetched_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          metrics.platformPostId, metrics.pageId, metrics.pageName,
          metrics.reactions, metrics.comments, metrics.shares, metrics.clicks,
          metrics.engagementRate, metrics.createdAt,
        ]
      );
    } catch (err: any) {
      // Best-effort — não logar como warn cada erro individual (muito ruidoso)
      this.stats.errors++;
    }
  }

  /**
   * Alimentar o BayesianOptimizer com os dados de engagement.
   * Esta é a conexão MEDIR → APRENDER.
   */
  private async feedBayesianLearner(metrics: PostMetrics[]): Promise<void> {
    for (const m of metrics) {
      if (m.engagementRate <= 0) continue;

      try {
        const postResult = await query(
          `SELECT category FROM posts WHERE platform_post_id = $1 LIMIT 1`,
          [m.platformPostId]
        );

        const category = postResult.rows[0]?.category || 'other';
        const hour = m.createdAt.getHours();

        // Reward: normalizar engagement rate para [0, 1]
        // Engagement rate > 5% = excelente (reward=1.0)
        // Engagement rate < 0.5% = fraco (reward=0.1)
        const reward = Math.min(1, Math.max(0.05, m.engagementRate * 20));

        await bayesianOptimizer.update(m.pageId, category, hour, reward);
        this.stats.bayesUpdates++;
      } catch {
        // Post pode não estar no DB — silencioso
      }
    }
  }
}

// Singleton
export const engagementReciler = new EngagementReciler();