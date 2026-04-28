/**
 * Memory Module Index
 */

export {
  initMemoryTables,
  recordPublishEvent,
  recordCouncilDecision,
  updateEngagementData,
  recomputeTimingPatterns,
  getBestTiming,
  getSimilarPosts,
  auditBias,
  getLearningState,
  resetMemory,
  closeMemoryPool,
} from './manager';

export type {
  MemoryEntry,
  TimingPattern,
  LearningState,
} from './manager';
