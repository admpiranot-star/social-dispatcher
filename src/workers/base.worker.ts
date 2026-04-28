import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../lib/logger';
import { DispatchJobData, MetaAPIError } from '../types';
import { query } from '../db/client';

export abstract class BaseWorker {
  protected worker: Worker;
  protected redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

  constructor(queueName: string, private processor: (job: Job<DispatchJobData>) => Promise<string | void>) {
    this.worker = new Worker(queueName, this.processJob.bind(this), {
      connection: this.redis,
      limiter: {
        max: config.RATE_LIMIT_PER_MIN,
        duration: 60000,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.worker.on('completed', (job) => {
      logger.info({ jobId: job.id }, 'Worker job completed');
    });

    this.worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, error: err?.message }, 'Worker job failed');
    });

    this.worker.on('error', (err) => {
      logger.error({ err }, 'Worker error');
    });
  }

  private async processJob(job: Job<DispatchJobData>): Promise<void> {
    const { postId, channel, correlationId } = job.data;
    const startTime = Date.now();

    try {
      logger.info(
        { jobId: job.id, postId, channel, correlationId, attempt: job.attemptsMade },
        'Processing social post'
      );

      // 0. Update status to 'processing' (traceability)
      await query('UPDATE posts SET status = $1, updated_at = NOW() WHERE id = $2', ['processing', postId]);

      const externalId = await this.processor(job);

      const durationMs = Date.now() - startTime;
      await this.logSuccess(postId, job.id!, channel, durationMs, (externalId as string) || undefined);

      logger.info(
        { jobId: job.id, postId, channel, durationMs, externalId, version: 'V1_STABLE' },
        'Social post processed successfully'
      );
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const retryable = err.retryable !== false && job.attemptsMade < 4;

      await this.logFailure(postId, job.id!, channel, err.message, retryable, durationMs);

      logger.error(
        { jobId: job.id, postId, channel, error: err.message, retryable },
        'Social post processing failed'
      );

      if (!retryable) {
        throw err;
      }
    }
  }

  protected async logSuccess(postId: string, jobId: string, channel: string, durationMs: number, externalId?: string) {
    // 1. Log in job_logs (per-channel tracking)
    await query(
      `INSERT INTO job_logs (post_id, job_id, channel, status, external_id, duration_ms, published_at)
       VALUES ((SELECT id FROM posts WHERE id = $1), $2, $3, 'published', $4, $5, NOW())`,
      [postId, jobId, channel, externalId, durationMs]
    );

    // 2. Update posts (main post record)
    await query(
      'UPDATE posts SET status = $1, platform_post_id = $2, updated_at = NOW() WHERE id = $3',
      ['published', externalId, postId]
    );
  }

  protected async logFailure(
    postId: string,
    jobId: string,
    channel: string,
    errorMessage: string,
    retryable: boolean,
    durationMs: number
  ) {
    const status = retryable ? 'retry' : 'failed';

    await query(
      `INSERT INTO job_logs (post_id, job_id, channel, status, error_message, duration_ms)
       VALUES ((SELECT id FROM posts WHERE id = $1), $2, $3, $4, $5, $6)`,
      [postId, jobId, channel, status, errorMessage, durationMs]
    );

    await query('UPDATE posts SET status = $1, updated_at = NOW() WHERE id = $2', [status, postId]);
  }

  async close() {
    await this.worker.close();
    this.redis.disconnect();
  }
}
