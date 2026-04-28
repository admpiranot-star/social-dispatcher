import { Job } from 'bullmq';
import axios from 'axios';
import { BaseWorker } from './base.worker';
import { config } from '../config';
import { DispatchJobData, WhatsAppBroadcast, MetaAPIError } from '../types';
import { tokenManager } from '../cache/token-manager';
import { rateLimiter } from '../cache/rate-limiter';

const GRAPH_API_URL = `https://graph.whatsapp.com/${config.META_API_VERSION}`;

export class WhatsAppWorker extends BaseWorker {
  constructor() {
    super('social-whatsapp', async (job: Job<DispatchJobData>) => {
      return await this.sendBroadcast(job);
    });
  }

  private async sendBroadcast(job: Job<DispatchJobData>) {
    const { postId, accountId, payload } = job.data;
    const waPayload = payload as WhatsAppBroadcast;

    const token = await tokenManager.getValidToken(accountId);
    await rateLimiter.checkLimit(accountId);

    try {
      for (const recipient of waPayload.recipients) {
        const body: Record<string, any> = {
          messaging_product: 'whatsapp',
          to: recipient,
          type: waPayload.messageType,
        };

        if (waPayload.messageType === 'template') {
          body.template = {
            name: waPayload.templateId,
            language: { code: 'pt_BR' },
            parameters: waPayload.templateParams,
          };
        } else if (waPayload.messageType === 'text') {
          body.text = { preview_url: true, body: waPayload.body };
        } else if (waPayload.messageType === 'media') {
          body.image = { link: waPayload.mediaUrl };
        }

        await axios.post(
          `${GRAPH_API_URL}/${waPayload.businessPhoneNumberId}/messages`,
          body,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000,
          }
        );
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        await tokenManager.invalidateToken(accountId);
        throw new MetaAPIError('Invalid token');
      }
      throw new MetaAPIError(err.response?.data?.error?.message || err.message);
    }
  }
}

export const whatsappWorker = new WhatsAppWorker();
