/**
 * Memory Scheduler
 * Agendamentos periódicos para memória evolutiva
 * - Recompute timing patterns: a cada 6h
 * - Bias audit: a cada 1h
 * - Learning state update: a cada 6h (junto com patterns)
 */

import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger';
import { config } from '../config';
import {
  recomputeTimingPatterns,
  auditBias,
  getLearningState,
  resetMemory,
} from './manager';

const scheduledTasks: ScheduledTask[] = [];

/**
 * Initialize memory evolution scheduler
 */
export async function initMemoryScheduler(): Promise<void> {
  logger.info({}, 'Initializing memory evolution scheduler...');

  // Recompute timing patterns every 6 hours
  const patternsTask = schedule('0 */6 * * *', async () => {
    logger.info({}, 'Running scheduled timing pattern recomputation...');
    const count = await recomputeTimingPatterns();
    logger.info({ patternsUpdated: count }, 'Timing patterns recomputed');

    // Check if we need to adapt mode
    const state = await getLearningState();
    if (state.accuracy < 0.6 && state.totalEntries > 50) {
      logger.warn({ accuracy: state.accuracy }, 'Accuracy below 60% - triggering memory reset');
      await resetMemory(14); // Keep 14 days
    }
  }, {
    timezone: config.SCHEDULER_TIMEZONE,
  });
  scheduledTasks.push(patternsTask);

  // Bias audit every hour
  const biasTask = schedule('0 * * * *', async () => {
    const { biasScore, issues } = await auditBias();
    if (issues.length > 0) {
      logger.warn({ biasScore, issues }, 'Bias detected in memory system');
    }
  }, {
    timezone: config.SCHEDULER_TIMEZONE,
  });
  scheduledTasks.push(biasTask);

  logger.info({}, 'Memory evolution scheduler initialized (patterns: 6h, bias: 1h)');
}

/**
 * Stop memory scheduler
 */
export async function stopMemoryScheduler(): Promise<void> {
  for (const task of scheduledTasks) {
    await task.stop();
  }
  scheduledTasks.length = 0;
  logger.info({}, 'Memory scheduler stopped');
}
