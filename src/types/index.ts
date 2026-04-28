/**
 * Social Dispatcher Types
 * Definições de tipos para distribuição multi-canal (Facebook, Instagram, WhatsApp)
 */

export type SocialChannel = 'facebook' | 'instagram' | 'whatsapp' | 'tiktok' | 'twitter' | 'linkedin';
export type ContentType = 'link' | 'photo' | 'video' | 'carousel' | 'story' | 'reel' | 'template' | 'broadcast';
export type PostStatus = 'pending' | 'queued' | 'processing' | 'published' | 'failed' | 'retry';
export type ABVariation = 'A' | 'B';

export interface SocialAccount {
  id: string;
  platform: SocialChannel;
  externalId: string;
  name: string;
  accessTokenEncrypted: string;
  tokenExpiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialPostPayload {
  id: string;
  title: string;
  link: string;
  imageUrl?: string;
  videoUrl?: string;
  summary: string;
  category: 'politics' | 'economy' | 'sports' | 'technology' | 'entertainment' | 'lotteries' | 'police' | 'jobs' | 'recipes' | 'other';
  priority: number;
  scheduledAt?: Date;
  channels: SocialChannel[];
  metadata: {
    sourceId?: string;
    utmCampaign: string;
    utmSource: string;
    abTestId?: string;
    abVariation?: ABVariation;
  };
}

export interface FacebookPost {
  pageId: string;
  pageToken?: string;      // Per-page token (multi-page routing)
  message: string;
  link?: string;
  imageUrl?: string;
  type: 'link' | 'photo' | 'video';
  scheduledPublishTime?: string;
}

export interface InstagramPost {
  businessAccountId: string;
  pageToken?: string;      // Per-page token for IG publish (multi-page routing)
  caption: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  type: 'feed' | 'carousel' | 'story' | 'reel';
}

export interface WhatsAppBroadcast {
  businessPhoneNumberId: string;
  messageType: 'template' | 'text' | 'media';
  recipients: string[];
  templateId?: string;
  templateParams?: Record<string, any>;
  body?: string;
  mediaUrl?: string;
}

export interface DispatchJobData {
  postId: string;
  accountId: string;
  channel: SocialChannel;
  payload: FacebookPost | InstagramPost | WhatsAppBroadcast;
  correlationId: string;
  attempt: number;
  timestamp: number;
}

export interface DispatchResult {
  jobId: string;
  postId: string;
  channel: SocialChannel;
  status: PostStatus;
  externalId?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  timestamp: Date;
  durationMs: number;
}

export interface PostMetrics {
  postId: string;
  platform: SocialChannel;
  externalId: string;
  impressions: number;
  clicks: number;
  reactions: number;
  shares: number;
  comments: number;
  saves: number;
  fetchedAt: Date;
}

export class SocialDispatcherError extends Error {
  constructor(
    message: string,
    public code: string = 'SOCIAL_DISPATCHER_ERROR',
    public retryable: boolean = false,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'SocialDispatcherError';
  }
}

export class TokenExpiryError extends SocialDispatcherError {
  constructor(message = 'Token expired or invalid') {
    super(message, 'TOKEN_EXPIRY_ERROR', false, 401);
  }
}

export class RateLimitError extends SocialDispatcherError {
  constructor(public retryAfterSeconds: number = 60) {
    super('Rate limit exceeded', 'RATE_LIMIT_ERROR', true, 429);
  }
}

export class MetaAPIError extends SocialDispatcherError {
  constructor(message: string, public metaErrorCode?: number, retryable: boolean = true) {
    super(message, 'META_API_ERROR', retryable, 500);
  }
}

export class ValidationError extends SocialDispatcherError {
  constructor(message: string, public details?: any) {
    super(message, 'VALIDATION_ERROR', false, 400);
  }
}

// =====================================================================
// PHASE 2: AGENTE INTELIGENTE - Tipos para Scheduling Dinâmico
// =====================================================================

export interface Account {
  id: string;
  accountName: string;
  platform: SocialChannel;
  externalId: string;
  followerCount: number;
  categoryFocus?: 'main' | 'politics' | 'tech' | 'entertainment' | 'regional' | 'lotteries';
  isMain: boolean;
  distributionWeight: number;
  webhookVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EngagementEvent {
  id: string;
  postId: string;
  socialAccountId: string;
  eventType: 'like' | 'comment' | 'share' | 'impression' | 'click';
  eventExternalId?: string; // For deduplication
  metricValue: number;
  metadata?: Record<string, any>;
  receivedAt: Date;
  processedAt?: Date;
  createdAt: Date;
}

export interface QueueState {
  id: string;
  postId: string;
  channel: SocialChannel;
  scheduledAt: Date;
  queuePosition: number;
  priorityScore: number;
  engagementRate: number;
  isStory: boolean;
  version: number; // For optimistic locking
  reprioritizedCount: number;
  lastReprioritizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReprioritizationDecision {
  postId: string;
  oldScheduledAt: Date;
  newScheduledAt: Date;
  oldQueuePosition: number;
  newQueuePosition: number;
  reason: 'breaking_news' | 'high_engagement' | 'category_trending' | 'manual_override' | 'system_optimization';
  agentDecision: {
    architectVote: {
      score: number;
      rationale: string;
    };
    strategistVote: {
      score: number;
      rationale: string;
      expectedEngagement: number;
    };
    operatorVote: {
      score: number;
      rationale: string;
    };
    consensus: number; // 0-1, higher = stronger consensus
  };
  triggeredBy: 'system' | 'user' | 'webhook';
  createdAt: Date;
}

export interface AgentVote {
  specialist: 'architect' | 'strategist' | 'operator';
  score: number; // 0-10, higher=more urgent
  rationale: string;
  metadata?: Record<string, any>;
}

export interface EngagementAnalysis {
  postId: string;
  category: string;
  engagementRate: number; // percentage
  clickThroughRate: number;
  shareRate: number;
  commentRate: number;
  trend: 'rising' | 'stable' | 'declining';
  shouldBump: boolean;
  recommendedDelay: number; // ms to wait before next post in category
}

export interface TimingOptimization {
  category: string;
  dayOfWeek: number;
  hourOfDay: number;
  historicalEngagementRate: number;
  predictedEngagementRate: number;
  recommendedScheduleTime: Date;
  confidence: number; // 0-1
}
