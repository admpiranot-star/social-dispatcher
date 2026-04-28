import { v4 as uuidv4 } from 'uuid';
import { queues } from '../queue/bullmq-setup';
import { logger } from '../lib/logger';
import { config } from '../config';
import { SocialPostPayload, DispatchResult, SocialChannel, PostStatus } from '../types';
import { query } from '../db/client';
import { Architect } from '../agent/specialists/architect';
import { Strategist } from '../agent/specialists/strategist';
import { queueStateManager } from '../queue/queue-state';
import {
  routeArticle,
  calculatePageScheduleTime,
  getPagesSummary,
  type PageConfig,
  type ContentCategory,
  type GeoScope,
} from '../config/pages';
import { platformConfigs } from '../config/platforms';

export class Dispatcher {
  /**
   * Dispatch a post to all relevant Facebook pages and Instagram accounts.
   * Uses multi-page routing based on article category, geo scope, and urgency.
   */
  async dispatch(payload: SocialPostPayload): Promise<DispatchResult[]> {
    const correlationId = uuidv4();
    const results: DispatchResult[] = [];

    // 1. Insert post to DB
    const postId = await this.insertPost(payload);

    // 2. Map category from payload to routing category
    const routingCategory = this.mapCategory(payload.category);
    const geoScope = this.extractGeoScope(payload);
    const isBreaking = (payload.priority ?? 5) >= 8;

    // 3. Route to matching pages
    const matchedPages = routeArticle({
      category: routingCategory,
      geoScope,
      isBreaking,
    });

    if (matchedPages.length === 0) {
      logger.warn({ postId, category: routingCategory, geoScope }, 'No pages matched for article');
      return results;
    }

    const summary = getPagesSummary();
    logger.info(
      {
        postId,
        category: routingCategory,
        geoScope,
        isBreaking,
        matchedPages: matchedPages.map(p => p.name),
        pageCount: matchedPages.length,
        totalPages: summary.enabled,
      },
      'Multi-page routing: matched pages'
    );

    // 4. Intelligent scheduling decision (Architect + Strategist, no Council overhead)
    let baseScheduledAt = payload.scheduledAt || new Date();
    let priorityScore = payload.priority;

    if (priorityScore < 10) {
      try {
        const decision = await this.computeScheduleDecision({
          ...payload,
          id: postId,
        });

        baseScheduledAt = decision.scheduledAt;
        priorityScore = Math.round(decision.priorityScore * 10);

        logger.info(
          { postId, scheduledAt: baseScheduledAt, priorityScore, reasoning: decision.reasoning },
          'Schedule decision applied (architect + strategist)'
        );
      } catch (agentErr: any) {
        logger.warn(
          { error: agentErr.message, postId },
          'Schedule decision failed, using default 5min delay'
        );
        baseScheduledAt = new Date(Date.now() + 5 * 60000);
      }
    } else {
      logger.info({ postId }, 'Priority 10: Bypassing scheduling for immediate dispatch');
    }

    // 5. Enqueue Facebook posts for each matched page
    for (const page of matchedPages) {
      try {
        // Calculate page-specific schedule time (stagger offset + windows)
        let pageScheduledAt = calculatePageScheduleTime(page, baseScheduledAt, priorityScore);

        // Enforce minimum interval between posts on the same page
        pageScheduledAt = await this.enforceMinInterval(page, pageScheduledAt, isBreaking, priorityScore);

        const fbResult = await this.enqueueFacebookPost(
          postId, page, payload, pageScheduledAt, priorityScore, correlationId
        );
        results.push(fbResult);

        // 6. If page has Instagram linked AND Instagram is enabled, enqueue IG post
        if (page.instagram && platformConfigs.instagram.enabled) {
          const igResult = await this.enqueueInstagramPost(
            postId, page, payload, pageScheduledAt, priorityScore, correlationId
          );
          results.push(igResult);
        } else if (page.instagram) {
          logger.info({ pageName: page.name }, 'Instagram disabled — skipping IG enqueue');
        }
      } catch (err: any) {
        logger.error(
          { postId, pageName: page.name, pageId: page.id, error: err.message },
          'Failed to enqueue post for page'
        );
        results.push({
          jobId: '',
          postId,
          channel: 'facebook',
          status: 'failed',
          error: `[${page.name}] ${err.message}`,
          timestamp: new Date(),
          durationMs: 0,
        });
      }
    }

    logger.info(
      {
        postId,
        correlationId,
        totalJobs: results.length,
        successful: results.filter(r => r.status === 'queued').length,
        failed: results.filter(r => r.status === 'failed').length,
      },
      'Multi-page dispatch complete'
    );

    // 7. Update post status to 'queued' (if at least one job was enqueued)
    if (results.some(r => r.status === 'queued')) {
      await query('UPDATE posts SET status = $1, updated_at = NOW() WHERE id = $2', ['queued', postId]);
    }

    return results;
  }

  /**
   * Enforce minimum interval between posts on the same page.
   * For breaking/plantão news, uses minIntervalBreakingMinutes (longer, to avoid flooding).
   * For normal content, uses minIntervalMinutes.
   *
   * Queries both queue_state (pending) and job_logs (recently published) to find
   * the latest scheduled/published time for this page's Facebook account.
   */
  private async enforceMinInterval(
    page: PageConfig,
    proposedTime: Date,
    isBreaking: boolean,
    priority: number = 5,
  ): Promise<Date> {
    // P0 #12: Emergency/Priority 10 posts bypass interval enforcement
    if (priority >= 10) {
      return proposedTime;
    }

    const minIntervalMinutes = isBreaking
      ? page.schedule.minIntervalBreakingMinutes
      : page.schedule.minIntervalMinutes;

    const minIntervalMs = minIntervalMinutes * 60_000;

    try {
      // Check the latest scheduled time for this page in queue_state (pending jobs)
      const pendingResult = await query(
        `SELECT MAX(scheduled_at) as last_scheduled
         FROM queue_state
         WHERE channel = 'facebook'
           AND scheduled_at > NOW() - INTERVAL '24 hours'`,
        []
      );

      // Also check the latest published time in job_logs for this specific page
      const publishedResult = await query(
        `SELECT MAX(j.created_at) as last_published
         FROM job_logs j
         WHERE j.channel = 'facebook'
           AND j.status = 'completed'
           AND j.account_id = $1
           AND j.created_at > NOW() - INTERVAL '24 hours'`,
        [page.id]
      );

      // Also check queue_state for this specific page (account_id might not exist in queue_state,
      // so we filter by post_id pattern which includes page.id)
      const pendingPageResult = await query(
        `SELECT MAX(scheduled_at) as last_scheduled
         FROM queue_state
         WHERE channel = 'facebook'
           AND scheduled_at > NOW() - INTERVAL '1 hour'`,
        []
      );

      let latestTime: Date | null = null;

      const pendingTime = pendingResult.rows[0]?.last_scheduled
        ? new Date(pendingResult.rows[0].last_scheduled)
        : null;

      const publishedTime = publishedResult.rows[0]?.last_published
        ? new Date(publishedResult.rows[0].last_published)
        : null;

      // Use the most recent of pending or published
      if (pendingTime && publishedTime) {
        latestTime = pendingTime > publishedTime ? pendingTime : publishedTime;
      } else {
        latestTime = pendingTime || publishedTime;
      }

      if (!latestTime) {
        return proposedTime; // No previous posts, use proposed time as-is
      }

      const earliestAllowed = new Date(latestTime.getTime() + minIntervalMs);

      if (proposedTime < earliestAllowed) {
        logger.info(
          {
            pageName: page.name,
            pageId: page.id,
            isBreaking,
            minIntervalMinutes,
            proposedTime,
            earliestAllowed,
            lastPostTime: latestTime,
          },
          'Enforcing minimum interval: pushing post forward'
        );
        return earliestAllowed;
      }

      return proposedTime;
    } catch (err: any) {
      // If DB query fails, don't block dispatch — just use proposed time
      logger.warn(
        { error: err.message, pageName: page.name },
        'Failed to check last post time for interval enforcement, using proposed time'
      );
      return proposedTime;
    }
  }

  /**
   * Enqueue a Facebook post for a specific page.
   */
  private async enqueueFacebookPost(
    postId: string,
    page: PageConfig,
    payload: SocialPostPayload,
    scheduledAt: Date,
    priorityScore: number,
    correlationId: string,
  ): Promise<DispatchResult> {
    const queue = queues['facebook'];
    if (!queue) throw new Error('Facebook queue not found');

    const message = this.buildFacebookMessage(payload, page);
    const jobId = `${postId}-fb-${page.id}`;

    await queueStateManager.addToQueue(postId, 'facebook', scheduledAt, priorityScore);

    const jobData = {
      postId,
      accountId: page.id,
      channel: 'facebook' as SocialChannel,
      payload: {
        pageId: page.id,
        pageToken: page.pageToken,
        message,
        link: payload.link,
        imageUrl: payload.imageUrl,
        type: (payload.imageUrl && !payload.link) ? 'photo' as const : 'link' as const,
      },
      correlationId,
      attempt: 1,
      timestamp: Date.now(),
    };

    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

    const job = await queue.add(postId, jobData, {
      priority: priorityScore,
      jobId,
      delay: delayMs,
    });

    logger.info(
      {
        jobId: job.id,
        postId,
        pageName: page.name,
        pageId: page.id,
        tier: page.tier,
        scheduledAt,
        delayMs,
      },
      'Facebook post enqueued for page'
    );

    return {
      jobId: job.id!,
      postId,
      channel: 'facebook',
      status: 'queued',
      timestamp: new Date(),
      durationMs: 0,
    };
  }

  /**
   * Enqueue an Instagram post for a page's linked IG account.
   */
  private async enqueueInstagramPost(
    postId: string,
    page: PageConfig,
    payload: SocialPostPayload,
    scheduledAt: Date,
    priorityScore: number,
    correlationId: string,
  ): Promise<DispatchResult> {
    const queue = queues['instagram'];
    if (!queue) throw new Error('Instagram queue not found');
    if (!page.instagram) throw new Error('Page has no linked Instagram');

    const caption = this.buildInstagramCaption(payload, page);
    const jobId = `${postId}-ig-${page.instagram.accountId}`;

    // Add 3-5 minutes extra delay for IG (avoid simultaneous FB+IG)
    const igDelay = 3 * 60_000 + Math.random() * 2 * 60_000;
    const igScheduledAt = new Date(scheduledAt.getTime() + igDelay);

    await queueStateManager.addToQueue(postId, 'instagram', igScheduledAt, priorityScore);

    const jobData = {
      postId,
      accountId: page.instagram.accountId,
      channel: 'instagram' as SocialChannel,
      articleTitle: payload.title,
      articleCategory: payload.category,
      payload: {
        businessAccountId: page.instagram.accountId,
        pageToken: page.pageToken,
        caption,
        mediaUrl: payload.imageUrl,
        type: 'feed' as const,
      },
      correlationId,
      attempt: 1,
      timestamp: Date.now(),
    };

    const delayMs = Math.max(0, igScheduledAt.getTime() - Date.now());

    const job = await queue.add(postId, jobData, {
      priority: priorityScore,
      jobId,
      delay: delayMs,
    });

    logger.info(
      {
        jobId: job.id,
        postId,
        igAccount: page.instagram.username,
        igAccountId: page.instagram.accountId,
        scheduledAt: igScheduledAt,
        delayMs,
      },
      'Instagram post enqueued'
    );

    return {
      jobId: job.id!,
      postId,
      channel: 'instagram',
      status: 'queued',
      timestamp: new Date(),
      durationMs: 0,
    };
  }

  private async insertPost(payload: SocialPostPayload): Promise<string> {
    const result = await query(
      `INSERT INTO posts (source_id, title, link, summary, category, priority, channels, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        payload.metadata.sourceId,
        payload.title,
        payload.link,
        payload.summary,
        payload.category,
        payload.priority,
        payload.channels,
        JSON.stringify(payload.metadata),
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Build Facebook message with optional page-specific prefix/suffix.
   */
  private buildFacebookMessage(payload: SocialPostPayload, page: PageConfig): string {
    const parts: string[] = [];

    // Page-specific prefix (e.g., "Campinas |", "JCardoso |")
    if (page.messaging.prefix) {
      parts.push(`${page.messaging.prefix} ${payload.title}`);
    } else {
      parts.push(payload.title);
    }

    // Summary (first 200 chars, if different from title)
    if (payload.summary && payload.summary !== payload.title) {
      const summaryExcerpt = payload.summary.length > 200
        ? payload.summary.slice(0, 197) + '...'
        : payload.summary;
      parts.push(summaryExcerpt);
    }

    // Page-specific suffix
    if (page.messaging.suffix) {
      parts.push(page.messaging.suffix);
    }

    return parts.join('\n\n');
  }

  /**
   * Build Instagram caption with hashtags (page-specific + category).
   */
  private buildInstagramCaption(payload: SocialPostPayload, page: PageConfig): string {
    const parts: string[] = [];

    // Title
    if (page.messaging.prefix) {
      parts.push(`${page.messaging.prefix} ${payload.title}`);
    } else {
      parts.push(payload.title);
    }

    // Summary (first 300 chars for IG)
    if (payload.summary && payload.summary !== payload.title) {
      const summaryExcerpt = payload.summary.length > 300
        ? payload.summary.slice(0, 297) + '...'
        : payload.summary;
      parts.push(summaryExcerpt);
    }

    // Link
    if (payload.link) {
      parts.push(`Leia mais: ${payload.link}`);
    }

    // Hashtags: base + category + page-specific
    const hashtags = this.buildHashtags(payload.category, page);
    parts.push(hashtags);

    return parts.join('\n\n');
  }

  private buildHashtags(category: string, page: PageConfig): string {
    const baseHashtags = ['#PiraNOT', '#Noticias', '#Brasil'];
    const categoryMap: Record<string, string[]> = {
      politics: ['#Politica', '#Governo'],
      economy: ['#Economia', '#Financas'],
      sports: ['#Esportes', '#Futebol'],
      technology: ['#Tecnologia', '#Tech'],
      entertainment: ['#Entretenimento'],
      lotteries: ['#Loterias', '#MegaSena', '#Lotofacil'],
      police: ['#Policia', '#Seguranca'],
      jobs: ['#Empregos', '#Vagas'],
      recipes: ['#Receitas', '#Cozinha'],
      other: [],
    };

    const tags = [
      ...baseHashtags,
      ...(categoryMap[category] || []),
      ...(page.messaging.extraHashtags || []),
    ];

    // IG limit: 30 hashtags max
    return tags.slice(0, 30).join(' ');
  }

  /**
   * Map article category to routing category.
   * The NP pipeline may use different category names than our routing config.
   */
  private mapCategory(category: string): ContentCategory {
    const map: Record<string, ContentCategory> = {
      politics: 'politics',
      politica: 'politics',
      economy: 'economy',
      economia: 'economy',
      sports: 'sports',
      esportes: 'sports',
      technology: 'technology',
      tecnologia: 'technology',
      entertainment: 'entertainment',
      entretenimento: 'entertainment',
      lotteries: 'lotteries',
      loterias: 'lotteries',
      police: 'police',
      policial: 'police',
      seguranca: 'police',
      jobs: 'jobs',
      empregos: 'jobs',
      vagas: 'jobs',
      recipes: 'recipes',
      receitas: 'recipes',
      culinaria: 'recipes',
    };
    return map[category?.toLowerCase()] || 'other';
  }

  /**
   * Extract geo scope from payload metadata.
   * NP articles may have beat/geo info in metadata.
   */
  private extractGeoScope(payload: SocialPostPayload): GeoScope | undefined {
    const meta = payload.metadata as Record<string, any>;
    const geo = meta?.geoScope || meta?.geo_scope || meta?.region;
    if (typeof geo === 'string') {
      const geoMap: Record<string, GeoScope> = {
        piracicaba: 'piracicaba',
        campinas: 'campinas',
        sorocaba: 'sorocaba',
        sumare: 'sumare',
        indaiatuba: 'indaiatuba',
        rio_claro: 'rio_claro',
        rioclaro: 'rio_claro',
        limeira: 'limeira',
        sao_paulo: 'sao_paulo',
        sp: 'sao_paulo',
        nacional: 'nacional',
        national: 'nacional',
        brasil: 'nacional',
      };
      return geoMap[geo.toLowerCase()];
    }
    return undefined;
  }

  /**
   * Compute scheduling decision using Architect + Strategist (no Council overhead).
   * Simplified version of the former orchestrator + councilDecision + operator.
   * 
   * Flow: 
   *   1. Architect checks queue load → score 1-9
   *   2. Strategist checks timing ML + category → score 1-9  
   *   3. Weighted blend (50/50) → delay in minutes
   */
  private async computeScheduleDecision(post: SocialPostPayload): Promise<{
    scheduledAt: Date;
    priorityScore: number;
    reasoning: string;
  }> {
    const now = new Date();
    
    // Architect: queue load assessment
    const architect = new Architect();
    const archVote = await architect.evaluatePost(post);

    // Strategist: timing optimization via ML
    const strategist = new Strategist();
    const stratVote = await strategist.evaluatePost(post);

    // Simple weighted blend (50/50 — no need for complex Council aggregation)
    const consensusScore = (archVote.score * 0.5 + stratVote.score * 0.5) / 10;
    
    // Delay formula: high consensus = short delay, low = longer
    // Score 10 → 12 min, Score 5 → 72 min, Score 1 → 120 min
    const delayMinutes = Math.max(0, (11 - consensusScore * 10) * 12);
    const scheduledAt = new Date(now.getTime() + delayMinutes * 60000);

    const reasoning = [
      `Queue: ${archVote.rationale}`,
      `Timing: ${stratVote.rationale}`,
      `Delay: ${delayMinutes.toFixed(0)}min`,
    ].join(' | ');

    return { scheduledAt, priorityScore: consensusScore, reasoning };
  }

  async getStatus(postId: string): Promise<any> {
    const result = await query(
      `SELECT j.*, p.title, p.link, m.* FROM job_logs j
       LEFT JOIN posts p ON j.post_id = p.id
       LEFT JOIN metrics m ON j.post_id = m.post_id
       WHERE j.post_id = $1
       ORDER BY j.created_at DESC`,
      [postId]
    );

    return result.rows;
  }
}

export const dispatcher = new Dispatcher();
