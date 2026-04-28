/**
 * TikTok Worker
 * Publica vídeos e conteúdo no TikTok via Content Publishing API
 */

import { Job } from 'bullmq';
import axios from 'axios';
import { BaseWorker } from './base.worker';
import { logger } from '../lib/logger';
import { DispatchJobData, MetaAPIError } from '../types';
import { config } from '../config';

const TIKTOK_API_URL = 'https://open-api.tiktok.com/v1';

export class TikTokWorker extends BaseWorker {
  constructor() {
    super('social-tiktok', async (job: Job<DispatchJobData>) => {
      return await this.publishPost(job);
    });
  }

  private async publishPost(job: Job<DispatchJobData>) {
    const { postId, accountId, payload, correlationId } = job.data;

    try {
      logger.info(
        { postId, accountId, correlationId },
        '▶️ TikTok: iniciando publicação'
      );

      // TikTok Content Publishing API requer:
      // 1. OAuth 2.0 token do criador
      // 2. Upload de vídeo (10s-10min)
      // 3. Metadados (caption, hashtags, thumbnail)
      // 4. Publicação

      // TODO: Implementar:
      // - Autenticação TikTok OAuth 2.0
      // - Upload de vídeo via presigned URL
      // - Publicação com agendamento (se disponível)

      logger.info(
        { postId, accountId },
        '✅ TikTok: vídeo agendado (demo)'
      );
    } catch (err: any) {
      logger.error(
        { error: err.message, postId, accountId, correlationId },
        '❌ TikTok: erro na publicação'
      );
      throw new MetaAPIError(err.message);
    }
  }
}

export const tikTokWorker = new TikTokWorker();
