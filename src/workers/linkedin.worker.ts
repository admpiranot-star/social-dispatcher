/**
 * LinkedIn Worker
 * Publica conteúdo no LinkedIn via API v2
 */

import { Job } from 'bullmq';
import axios from 'axios';
import { BaseWorker } from './base.worker';
import { logger } from '../lib/logger';
import { DispatchJobData, MetaAPIError } from '../types';
import { config } from '../config';

const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

export class LinkedInWorker extends BaseWorker {
  constructor() {
    super('social-linkedin', async (job: Job<DispatchJobData>) => {
      return await this.publishPost(job);
    });
  }

  private async publishPost(job: Job<DispatchJobData>) {
    const { postId, accountId, payload, correlationId } = job.data;

    try {
      logger.info(
        { postId, accountId, correlationId },
        '💼 LinkedIn: iniciando publicação'
      );

      // LinkedIn API v2 endpoints:
      // POST /ugcPosts - Posts de usuário
      // POST /organizationalAssetAwareUgcPosts - Posts de página (empresa)

      const linkedInText = this.buildLinkedInText(payload);

      logger.info(
        { postId, text: linkedInText.substring(0, 50) },
        '📝 LinkedIn: post composto'
      );

      // TODO: Implementar:
      // 1. Autenticação OAuth 2.0 (Access Token)
      // 2. Determinar se publicar como pessoa ou página
      // 3. Upload de media (imagem)
      // 4. POST /ugcPosts ou /organizationalAssetAwareUgcPosts
      // 5. Suporte a agendamento (LinkedIn permite via scheduling)
    } catch (err: any) {
      logger.error(
        { error: err.message, postId, accountId, correlationId },
        '❌ LinkedIn: erro na publicação'
      );
      throw new MetaAPIError(err.message);
    }
  }

  private buildLinkedInText(payload: any): string {
    // LinkedIn permite posts até 3000 caracteres
    const title = payload.message || payload.caption || '';
    const link = payload.link || '';

    return `${title}\n\n🔗 Leia mais:\n${link}`;
  }
}

export const linkedInWorker = new LinkedInWorker();
