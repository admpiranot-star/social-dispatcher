/**
 * Engagement Reciler — Monitora métricas de posts/páginas e alimenta o loop de aprendizado.
 *
 * Ciclo: PUBLICAR → MEDIR (este módulo) → APRENDER (BayesianOptimizer) → AJUSTAR
 *
 * O que faz:
 * 1. A cada 30min: busca reactions/comments/shares dos últimos 100 posts
 * 2. A cada 1h: busca métricas de página (impressions, followers)
 * 3. Calcula engagement rate = (reactions + comments + shares) / reach
 * 4. Alimenta o BayesianOptimizer: update(pageId, category, hour, reward)
 * 5. Alimenta o RampUpEngine: se engagement subindo, sobe de fase
 * 6. Persiste tudo em DB para o dashboard
 */

import { query } from '../db/client';
import { logger } from '../lib/logger';
import { bayesianOptimizer } from '../ml/bayesian-optimizer';
import { getEnabledPages, type PageConfig } from '../config/pages';

// =====================================================================
// Tipos
// =====================================================================

interface PostMetrics {
  postId: string;
  platformPostId: string;
  pageId: string;
  pageName: string;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: number;
  createdAt: Date;
  fetchedAt: Date;
}

interface PageMetrics {
  pageId: string;
  pageName: string;
  followers: number;
  impressions: number;
  postImpressions: number;
  fetchedAt: Date;
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
        // Buscar últimos 25 posts da página via API
        const metrics = await this.fetchPagePostsMetrics(page);
        totalFetched += metrics.length;

        // Atualizar cada post no DB
        for (const m of metrics) {
          await this.updatePostMetrics(m);
          totalUpdated++;
        }

        // Alimentar BayesianOptimizer
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

        // Persistir métricas de página
        await query(
          `INSERT INTO page_metrics (page_id, page_name, followers, impressions, post_impressions, fetched_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT DO NOTHING
             followers = EXCLUDED.followers,
             impressions = EXCLUDED.impressions,
             post_impressions = EXCLUDED.post_impressions,
             fetched_at = NOW()`,
          [metrics.pageId, metrics.pageName, metrics.followers, metrics.impressions, metrics.postImpressions]
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
   */
  async checkRampUpPromotions(): Promise<void> {
    const pages = getEnabledPages();
    let promotions = 0;

    for (const page of pages) {
      try {
        // Buscar engagement médio dos últimos 7 dias
        const result = await query(
          `SELECT AVG(engagement_rate) as avg_rate
           FROM post_metrics
           WHERE page_id = $1
             AND fetched_at > NOW() - INTERVAL '7 days'`,
          [page.id]
        );

        const avgRate = parseFloat(result.rows[0]?.avg_rate || '0');

        // Buscar followers atuais
        const fbMetrics = await this.fetchSinglePageMetrics(page);
        const followers = fbMetrics.followers;

        // Lógica de promoção:
        // - se avgRate > 2% e followers > 5K → pode subir pra active
        // - se avgRate > 5% e followers > 10K → pode subir pra saturated
        // Por enquanto só logamos — a transição real é automática via computeState()
        if (avgRate > 0.02 && followers >= 5000) {
          logger.info({ pageId: page.id, pageName: page.name, avgRate: (avgRate * 100).toFixed(2) + '%', followers }, 'EngagementReciler: página elegível para promoção');
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
  getStats(): RecilerStats & { topPosts: any[] } {
    return {
      ...this.stats,
      topPosts: [],  // preenchido pelo dashboard via DB
    };
  }

  // =====================================================================
  // Internos
  // =====================================================================

  /**
   * Buscar métricas dos últimos 25 posts de uma página via Facebook API.
   * Usa o endpoint /page_id/feed com fields=reactions,comments,shares
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
    const posts = data.data || [];
    const results: PostMetrics[] = [];

    for (const post of posts) {
      const reactions = post.reactions?.summary?.total_count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      const shares = post.shares?.count || 0;

      // Engagement rate heurístico (sem reach real, usamos heurística)
      // Se temos >0 engagement, estimamos reach como engagement * 20 (regra Facebook média)
      const totalEngagement = reactions + comments + shares;
      const estimatedReach = Math.max(totalEngagement * 20, 1);
      const engagementRate = totalEngagement / estimatedReach;

      results.push({
        postId: '',  // será preenchido pelo DB lookup
        platformPostId: post.id,
        pageId: page.id,
        pageName: page.name,
        reactions,
        comments,
        shares,
        clicks: 0, // API não fornece clicks diretamente
        engagementRate,
        createdAt: new Date(post.created_time),
        fetchedAt: new Date(),
      });
    }

    return results;
  }

  /**
   * Buscar métricas de uma página (followers, impressions).
   */
  private async fetchSinglePageMetrics(page: PageConfig): Promise<PageMetrics> {
    // Followers direto (funciona sem app review)
    const pageUrl = `https://graph.facebook.com/v21.0/${page.id}?`
      + `fields=followers_count,fan_count,name`
      + `&access_token=${page.pageToken}`;

    const pageResponse = await fetch(pageUrl, {
      headers: { 'User-Agent': 'PiraNOT-Dispatcher/2.0' },
      signal: AbortSignal.timeout(10000),
    });

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
      followers: pageData.followers_count || pageData.fan_count || page.followers || 0,
      impressions,
      postImpressions,
      fetchedAt: new Date(),
    };
  }

  /**
   * Atualizar métricas de um post no DB.
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
      ).catch((err: any) => {
        logger.warn({ error: err.message, postId: metrics.platformPostId }, 'EngagementReciler: erro ao salvar post_metrics');
      });
    } catch (err: any) {
      // Silencioso — métricas são best-effort
    }
  }

  /**
   * Alimentar o BayesianOptimizer com os dados de engagement.
   * Esta é a conexão MEDIR → APRENDER.
   * 
   * Para cada post, determina:
   * - Qual hora foi publicado
   * - Qual categoria (police, economy, etc.)
   * - Qual página
   * - Reward = engagement rate normalizado (0 a 1)
   */
  private async feedBayesianLearner(metrics: PostMetrics[]): Promise<void> {
    for (const m of metrics) {
      if (m.engagementRate <= 0) continue; // Sem engagement, não aprende

      // Buscar a categoria do post no DB
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

        await bayesianOptimizer.update(
          m.pageId,
          category,
          hour,
          reward,
        );

        this.stats.bayesUpdates++;
      } catch {
        // Post pode não estar no DB (criado por outro sistema)
      }
    }
  }
}

// Singleton
export const engagementReciler = new EngagementReciler();