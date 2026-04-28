/**
 * Instagram Worker — Sprint 1
 * Usa FACEBOOK_PAGE_TOKEN do .env (mesmo token funciona para IG via Page)
 * Instagram Content Publishing API usa graph.facebook.com (NÃO graph.instagram.com)
 * Fluxo: 1) Create media container → 2) Publish container
 */

import { Job } from 'bullmq';
import axios from 'axios';
import { BaseWorker } from './base.worker';
import { config } from '../config';
import { logger } from '../lib/logger';
import { DispatchJobData, InstagramPost, MetaAPIError, RateLimitError, SocialPostPayload } from '../types';
import { rateLimiter } from '../cache/rate-limiter';
import { checkUrlAlive } from '../lib/url-check';
import { satoriArtGenerator } from '../media/satori-art-generator';
import { query } from '../db/client';

// Instagram Content Publishing API goes through Facebook Graph API
const GRAPH_API_URL = `https://graph.facebook.com/${config.META_API_VERSION}`;

// Instagram API limits: 25 posts per 24h per account
const IG_DAILY_LIMIT = 25;

export class InstagramWorker extends BaseWorker {
  constructor() {
    super('social-instagram', async (job: Job<DispatchJobData>) => {
      return await this.publishPost(job);
    });
  }

  private async publishPost(job: Job<DispatchJobData>) {
    const { postId, payload } = job.data;
    const igPayload = payload as InstagramPost;

    // Use per-page token from payload (multi-page routing), fallback to env
    // The page token has instagram_content_publish permission
    const token = igPayload.pageToken || config.FACEBOOK_PAGE_TOKEN;
    if (!token) {
      throw new MetaAPIError('No page token available for IG publishing');
    }

    // Use config IG account ID as default, fallback to payload
    const igAccountId = igPayload.businessAccountId || config.INSTAGRAM_ACCOUNT_ID;
    if (!igAccountId) {
      throw new MetaAPIError('Instagram Account ID not configured');
    }

    // Rate limit by IG account
    await rateLimiter.checkLimit(`ig:${igAccountId}`);

    // Verify any link in caption is alive (extract URL from caption text)
    const urlMatch = igPayload.caption.match(/https?:\/\/[^\s)]+/);
    if (urlMatch) {
      const linkUrl = urlMatch[0];
      const urlCheck = await checkUrlAlive(linkUrl);
      if (!urlCheck.alive) {
        logger.warn(
          { postId, link: linkUrl, statusCode: urlCheck.statusCode, error: urlCheck.error },
          'Instagram: link in caption is not accessible — aborting post'
        );
        const err = new MetaAPIError(
          `Link not accessible (HTTP ${urlCheck.statusCode || 'timeout'}): ${linkUrl}`
        );
        (err as any).retryable = false;
        throw err;
      }
      logger.debug({ postId, link: linkUrl, durationMs: urlCheck.durationMs }, 'Instagram: link verified alive');
    }

    try {
      // 1. Resolve media URL — Instagram REQUIRES an image for feed posts
      //    Always generate a branded arte using Satori, regardless of source image
      let mediaUrl = igPayload.mediaUrl || igPayload.mediaUrls?.[0];

      // Extract title and category from caption (first line = title) or job metadata
      const captionLines = igPayload.caption.split('\n');
      const articleTitle = (job.data as any).articleTitle || captionLines[0]?.replace(/[#*_]/g, '').trim() || 'PiraNOT';
      const articleCategory = (job.data as any).articleCategory || 'other';

      // Generate branded arte with Satori (uses source image as background if available)
      try {
        logger.info({ postId, hasSourceImage: !!mediaUrl, category: articleCategory }, 'Generating Instagram arte with Satori');
        
        const arteResult = await satoriArtGenerator.generateAndPublish({
          title: articleTitle,
          category: articleCategory,
          imageUrl: mediaUrl, // Original image becomes the background
          format: 'feed',
        });

        mediaUrl = arteResult.publicUrl;
        logger.info(
          {
            postId,
            publicUrl: arteResult.publicUrl,
            generationTimeMs: arteResult.generationTimeMs,
            bgSource: arteResult.backgroundSource,
          },
          'Instagram arte generated and published'
        );
      } catch (artErr: any) {
        logger.error({ postId, error: artErr.message }, 'Arte generation failed');
        
        // Fallback: if we have the original image, use it as-is
        if (mediaUrl) {
          logger.warn({ postId, mediaUrl }, 'Falling back to raw source image');
        } else {
          throw new MetaAPIError('Instagram requires an image but arte generation failed and no source image available');
        }
      }

      // 2. Create media container
      logger.info({ postId, igAccountId, mediaUrl }, 'Creating IG media container');

      const containerResponse = await axios.post(
        `${GRAPH_API_URL}/${igAccountId}/media`,
        {
          image_url: mediaUrl,
          caption: igPayload.caption,
          access_token: token,
        },
        { timeout: 30000 } // IG container creation can be slow
      );

      const containerId = containerResponse.data?.id;
      if (!containerId) {
        throw new MetaAPIError('Instagram API did not return a container ID');
      }

      logger.info({ postId, containerId }, 'IG media container created');

      // 3. Wait for container to be ready (IG processes images async)
      await this.waitForContainerReady(igAccountId, containerId, token);

      // 4. Publish the container (makes it visible to followers)
      const publishResponse = await axios.post(
        `${GRAPH_API_URL}/${igAccountId}/media_publish`,
        {
          creation_id: containerId,
          access_token: token,
        },
        { timeout: 15000 }
      );

      const externalId = publishResponse.data?.id;

      logger.info(
        { postId, externalId, igAccountId, containerId, mediaUrl },
        'Instagram post published successfully'
      );

      return externalId as string;
    } catch (err: any) {
      const status = err.response?.status;
      const metaError = err.response?.data?.error;

      if (status === 429 || metaError?.code === 4 || metaError?.code === 32) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '300', 10);
        logger.warn({ postId, igAccountId, retryAfter }, 'Instagram rate limit hit');
        throw new RateLimitError(retryAfter);
      }

      if (status === 401 || metaError?.code === 190) {
        logger.error({ postId, igAccountId, metaError }, 'Instagram token invalid — check FACEBOOK_PAGE_TOKEN');
        const apiErr = new MetaAPIError(metaError?.message || 'Token invalid', metaError?.code);
        (apiErr as any).retryable = false;
        throw apiErr;
      }

      // Re-throw if already a MetaAPIError
      if (err instanceof MetaAPIError) {
        throw err;
      }

      const message = metaError?.message || err.message;
      logger.error({ postId, igAccountId, status, metaError }, `Instagram publish error: ${message}`);
      throw new MetaAPIError(message, metaError?.code);
    }
  }

  /**
   * Instagram processes images asynchronously.
   * Poll the container status until it's FINISHED or times out.
   */
  private async waitForContainerReady(
    igAccountId: string,
    containerId: string,
    token: string,
    maxRetries: number = 10,
    intervalMs: number = 3000
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const statusResponse = await axios.get(
          `${GRAPH_API_URL}/${containerId}`,
          {
            params: {
              fields: 'status_code',
              access_token: token,
            },
            timeout: 10000,
          }
        );

        const statusCode = statusResponse.data?.status_code;

        if (statusCode === 'FINISHED') {
          logger.debug({ containerId, attempts: i + 1 }, 'IG container ready');
          return;
        }

        if (statusCode === 'ERROR') {
          throw new MetaAPIError(`IG container creation failed: ${statusResponse.data?.status || 'unknown error'}`);
        }

        // IN_PROGRESS — wait and retry
        logger.debug({ containerId, statusCode, attempt: i + 1 }, 'IG container processing...');
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch (err: any) {
        if (err instanceof MetaAPIError) throw err;
        // Network error on status check — wait and retry
        logger.warn({ containerId, error: err.message, attempt: i + 1 }, 'Error checking IG container status');
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    // Timed out waiting — try publishing anyway, it might work
    logger.warn({ containerId, maxRetries }, 'IG container status check timed out — attempting publish anyway');
  }
}

export const instagramWorker = new InstagramWorker();
