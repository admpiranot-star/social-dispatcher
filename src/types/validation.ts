/**
 * Zod Validation Schemas
 * P0 #8: Input validation para todos os endpoints da API
 */

import { z } from 'zod';

// =====================================================================
// Enums compartilhados
// =====================================================================

export const SocialChannelSchema = z.enum([
  'facebook',
  'instagram',
  'whatsapp',
  'tiktok',
  'twitter',
  'linkedin',
]);

export const CategorySchema = z.enum([
  'politics',
  'economy',
  'sports',
  'technology',
  'entertainment',
  'lotteries',
  'police',
  'jobs',
  'recipes',
  'other',
]);

// =====================================================================
// POST /dispatch - DispatchPayload
// =====================================================================

export const DispatchMetadataSchema = z.object({
  sourceId: z.string().uuid().optional(),
  utmCampaign: z.string().min(1).max(100).default('piranot'),
  utmSource: z.string().min(1).max(100).default('social'),
  abTestId: z.string().uuid().optional(),
  abVariation: z.enum(['A', 'B']).optional(),
});

export const DispatchPayloadSchema = z.object({
  title: z
    .string()
    .min(1, 'title must have at least 1 character')
    .max(500, 'title must have at most 500 characters')
    .trim(),
  link: z
    .string()
    .url('link must be a valid URL'),
  summary: z
    .string()
    .max(2000, 'summary must have at most 2000 characters')
    .default(''),
  category: CategorySchema.default('other'),
  priority: z
    .number()
    .int('priority must be an integer')
    .min(1, 'priority must be at least 1')
    .max(10, 'priority must be at most 10')
    .default(5),
  channels: z
    .array(SocialChannelSchema)
    .min(1, 'at least one channel is required')
    .max(6, 'maximum 6 channels allowed'),
  imageUrl: z
    .string()
    .url('imageUrl must be a valid URL')
    .optional(),
  videoUrl: z
    .string()
    .url('videoUrl must be a valid URL')
    .optional(),
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be a valid ISO 8601 datetime' })
    .optional(),
  metadata: DispatchMetadataSchema.default({
    utmCampaign: 'piranot',
    utmSource: 'social',
  }),
});

export type DispatchPayloadInput = z.infer<typeof DispatchPayloadSchema>;

// =====================================================================
// POST /queue/reprioritize - ReprioritizeRequest
// =====================================================================

export const ReprioritizeRequestSchema = z.object({
  postId: z
    .string()
    .uuid('postId must be a valid UUID'),
  newScheduledAt: z
    .string()
    .datetime({ message: 'newScheduledAt must be a valid ISO 8601 datetime' })
    .refine(
      (val) => new Date(val) > new Date(),
      { message: 'newScheduledAt cannot be in the past' }
    ),
  reason: z
    .string()
    .min(1, 'reason is required')
    .max(500, 'reason must have at most 500 characters')
    .default('manual_override'),
});

export type ReprioritizeRequestInput = z.infer<typeof ReprioritizeRequestSchema>;

// =====================================================================
// GET /analytics/* - AnalyticsQuery
// =====================================================================

export const AnalyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int('days must be an integer')
    .min(1, 'days must be at least 1')
    .max(365, 'days must be at most 365')
    .default(7),
});

export type AnalyticsQueryInput = z.infer<typeof AnalyticsQuerySchema>;

// =====================================================================
// GET /analytics/trending - TrendingQuery
// =====================================================================

export const TrendingQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must be at most 100')
    .default(10),
});

export type TrendingQueryInput = z.infer<typeof TrendingQuerySchema>;

// =====================================================================
// POST /queue/analyze - AnalyzeRequest
// =====================================================================

export const AnalyzeRequestSchema = z.object({
  channel: SocialChannelSchema,
});

export type AnalyzeRequestInput = z.infer<typeof AnalyzeRequestSchema>;

// =====================================================================
// GET /queue?channel= - QueueQuery
// =====================================================================

export const QueueQuerySchema = z.object({
  channel: SocialChannelSchema,
});

export type QueueQueryInput = z.infer<typeof QueueQuerySchema>;

// =====================================================================
// Helper: Format ZodError for API response
// =====================================================================

export function formatZodError(error: z.ZodError): {
  error: string;
  details: Array<{ field: string; message: string }>;
} {
  return {
    error: 'Validation failed',
    details: error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    })),
  };
}
