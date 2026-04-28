import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../lib/logger';
import { SocialChannel, DispatchJobData } from '../types';

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE_NAMES = {
  FACEBOOK: 'social-facebook',
  INSTAGRAM: 'social-instagram',
  WHATSAPP: 'social-whatsapp',
  DLQ: 'social-dlq',
};

export function createQueue(name: string) {
  return new Queue<DispatchJobData>(name, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { age: 86400 },
      removeOnFail: false,
    },
  });
}

export const queues: Record<string, Queue<DispatchJobData>> = {
  facebook: createQueue(QUEUE_NAMES.FACEBOOK),
  instagram: createQueue(QUEUE_NAMES.INSTAGRAM),
  whatsapp: createQueue(QUEUE_NAMES.WHATSAPP),
  dlq: createQueue(QUEUE_NAMES.DLQ),
};

export async function setupQueueListeners() {
  for (const [channel, queue] of Object.entries(queues)) {
    const queueEvents = new QueueEvents(queue.name, { connection: redis });
    
    queueEvents.on('completed', (ev) => {
      logger.info({ jobId: ev.jobId, channel }, 'Job completed');
    });

    queueEvents.on('failed', (ev) => {
      logger.warn({ jobId: ev.jobId, channel, err: ev.failedReason }, 'Job failed');
    });

    queueEvents.on('error', (err) => {
      logger.error({ channel, err }, 'Queue error');
    });
  }
}

export async function getQueueStats() {
  const stats: Record<string, any> = {};
  for (const [channel, queue] of Object.entries(queues)) {
    const counts = await queue.getJobCounts();
    stats[channel] = counts;
  }
  return stats;
}
