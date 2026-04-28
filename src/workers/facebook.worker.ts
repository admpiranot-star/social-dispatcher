/**
 * Facebook Worker — Sprint 1
 * Usa FACEBOOK_PAGE_TOKEN do .env (System User token, never expires)
 * Sem dependência de tokenManager/DB para tokens
 */

import { Job } from 'bullmq';
import axios from 'axios';
import { BaseWorker } from './base.worker';
import { config } from '../config';
import { logger } from '../lib/logger';
import { DispatchJobData, FacebookPost, MetaAPIError, RateLimitError } from '../types';
import { rateLimiter } from '../cache/rate-limiter';
import { checkUrlAlive } from '../lib/url-check';
import { query } from '../db/client';
import { getEnabledPages } from '../config/pages';
import { recordPublishEvent } from '../memory/manager';

const GRAPH_API_URL = `https://graph.facebook.com/${config.META_API_VERSION}`;

export class FacebookWorker extends BaseWorker {
  constructor() {
    super('social-facebook', async (job: Job<DispatchJobData>) => {
      return await this.publishPost(job);
    });
  }

  private resolveToken(fbPayload: FacebookPost): string {
    // 1. Per-job token (set during dispatch)
    if (fbPayload.pageToken) return fbPayload.pageToken;
    // 2. Lookup from pages config by pageId
    if (fbPayload.pageId) {
      const page = getEnabledPages().find(p => p.id === fbPayload.pageId);
      if (page?.pageToken) return page.pageToken;
    }
    // 3. Global fallback (PIRA NOT main page token)
    return config.FACEBOOK_PAGE_TOKEN;
  }

  private async publishPost(job: Job<DispatchJobData>) {
    const { postId, payload } = job.data;
    const fbPayload = payload as FacebookPost;

    // Resolve token: payload → pages config → env fallback
    const token = this.resolveToken(fbPayload);
    if (!token) {
      throw new MetaAPIError('No page token available (payload, pages config, or FACEBOOK_PAGE_TOKEN)');
    }

    // Use config pageId as default, fallback to payload
    const pageId = fbPayload.pageId || config.FACEBOOK_PAGE_ID;
    if (!pageId) {
      throw new MetaAPIError('Facebook Page ID not configured');
    }

    // Rate limit by page ID
    await rateLimiter.checkLimit(`fb:${pageId}`);

    // Verify link is alive before posting (avoid posting dead links)
    if (fbPayload.link) {
      const urlCheck = await checkUrlAlive(fbPayload.link);
      if (!urlCheck.alive) {
        logger.warn(
          { postId, link: fbPayload.link, statusCode: urlCheck.statusCode, error: urlCheck.error },
          'Facebook: link is not accessible — aborting post'
        );
        const err = new MetaAPIError(
          `Link not accessible (HTTP ${urlCheck.statusCode || 'timeout'}): ${fbPayload.link}`,
          undefined,
          false // Don't retry dead links
        );
        throw err;
      }
      logger.debug({ postId, link: fbPayload.link, durationMs: urlCheck.durationMs }, 'Facebook: link verified alive');
    }

    // Build request based on post type
    let endpoint: string;
    let body: Record<string, any>;

    if (fbPayload.type === 'link' && fbPayload.link) {
      endpoint = `${pageId}/feed`;
      body = {
        message: fbPayload.message,
        link: fbPayload.link,
        access_token: token,
      };
    } else if (fbPayload.type === 'photo' && fbPayload.imageUrl) {
      endpoint = `${pageId}/photos`;
      body = {
        url: fbPayload.imageUrl,
        caption: fbPayload.message,
        access_token: token,
      };
    } else if (fbPayload.message) {
      // Text-only post
      endpoint = `${pageId}/feed`;
      body = {
        message: fbPayload.message,
        access_token: token,
      };
    } else {
      throw new MetaAPIError('Invalid Facebook payload: need message, link, or photo');
    }

    // Publish to Facebook Graph API
    try {
      const response = await axios.post(`${GRAPH_API_URL}/${endpoint}`, body, {
        timeout: 15000,
      });

      const externalId = response.data.id || response.data.post_id;

      logger.info(
        { postId, externalId, pageId, type: fbPayload.type },
        'Facebook post published successfully'
      );

      // Record publish event for learning feedback loop
      try {
        await recordPublishEvent({
          postId: postId,
          platform: 'facebook',
          category: job.data.channel,
          publishedAt: new Date(),
          hourOfDay: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
          engagementRate: 0,
          impressions: 0,
          councilScore: 0,
          councilAccuracy: 0,
          timingScore: 0,
          tags: [],
          metadata: { pageId, externalId, type: fbPayload.type },
        });
        logger.debug({ postId }, 'Publish event recorded for learning');
      } catch (memErr: any) {
        logger.warn({ postId, error: memErr.message }, 'Failed to record publish event (non-blocking)');
      }

      return externalId as string;
    } catch (err: any) {
      const status = err.response?.status;
      const metaError = err.response?.data?.error;

      if (status === 429 || metaError?.code === 32 || metaError?.code === 4) {
        // Rate limit — Meta error codes: 32 = page rate limit, 4 = app rate limit
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '60', 10);
        logger.warn({ postId, pageId, retryAfter }, 'Facebook rate limit hit');
        throw new RateLimitError(retryAfter);
      }

      if (status === 401 || metaError?.code === 190) {
        // Token invalid — this shouldn't happen with System User token
        logger.error({ postId, pageId, metaError }, 'Facebook token invalid — check META_SYSTEM_TOKEN');
        throw new MetaAPIError(metaError?.message || 'Token invalid', metaError?.code, false);
      }

      // Other errors
      const message = metaError?.message || err.message;
      logger.error({ postId, pageId, status, metaError }, `Facebook publish error: ${message}`);
      throw new MetaAPIError(message, metaError?.code);
    }
  }
}

export const facebookWorker = new FacebookWorker();
