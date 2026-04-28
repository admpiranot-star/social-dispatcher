/**
 * Twitter/X Worker
 * Publica tweets e conteúdo no Twitter/X via API v2
 */

import { Job } from 'bullmq';
import axios from 'axios';
import { BaseWorker } from './base.worker';
import { logger } from '../lib/logger';
import { DispatchJobData, MetaAPIError } from '../types';
import { config } from '../config';

const TWITTER_API_URL = 'https://api.twitter.com/2';

export class TwitterWorker extends BaseWorker {
  constructor() {
    super('social-twitter', async (job: Job<DispatchJobData>) => {
      return await this.publishTweet(job);
    });
  }

  private async publishTweet(job: Job<DispatchJobData>) {
    const { postId, accountId, payload, correlationId } = job.data;

    try {
      logger.info(
        { postId, accountId, correlationId },
        '🐦 Twitter: iniciando publicação'
      );

      // Twitter API v2 POST /tweets
      // Requer Bearer Token ou OAuth 2.0 do usuário da conta

      const tweetText = this.buildTweetText(payload);

      logger.info(
        { postId, tweetText: tweetText.substring(0, 50) },
        '📝 Twitter: tweet composto'
      );

      // TODO: Implementar:
      // 1. Autenticação com Twitter API v2 (OAuth 2.0)
      // 2. Upload de media (imagens) via media endpoint
      // 3. Composição de tweet (max 280 chars)
      // 4. POST /tweets com Bearer Token
    } catch (err: any) {
      logger.error(
        { error: err.message, postId, accountId, correlationId },
        '❌ Twitter: erro na publicação'
      );
      throw new MetaAPIError(err.message);
    }
  }

  private buildTweetText(payload: any): string {
    // Limitar a 280 caracteres
    const title = payload.message || payload.caption || '';
    const link = payload.link || '';

    if (title.length + link.length > 280) {
      return `${title.substring(0, 250)}... ${link}`;
    }

    return `${title}\n\n${link}`;
  }
}

export const twitterWorker = new TwitterWorker();
