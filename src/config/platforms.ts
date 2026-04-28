/**
 * Platform Configuration
 * Configuração multi-plataforma para todas as redes sociais
 * Sprint 0 - Story 3: Late.dev Integration + Direct APIs
 */

import { SocialChannel } from '../types';

export interface PlatformConfig {
  enabled: boolean;
  apiType: 'late' | 'direct' | 'disabled';
  credentials: Record<string, string>;
  rateLimits: {
    maxPostsPerDay: number;
    maxPostsPerHour: number;
    minIntervalMs: number;
  };
  features: {
    text: boolean;
    image: boolean;
    video: boolean;
    carousel: boolean;
    story: boolean;
    reel: boolean;
    link: boolean;
  };
  contentLimits: {
    maxTextLength: number;
    maxHashtags: number;
    maxImages: number;
    maxVideoSizeMB: number;
  };
}

export type PlatformConfigs = Record<SocialChannel, PlatformConfig>;

export const platformConfigs: PlatformConfigs = {
  facebook: {
    enabled: process.env.FACEBOOK_ENABLED !== 'false',
    apiType: (process.env.FACEBOOK_API_TYPE as 'late' | 'direct') || 'direct',
    credentials: {
      pageId: process.env.FACEBOOK_PAGE_ID || '',
      pageAccessToken: process.env.FACEBOOK_PAGE_TOKEN || '',
      appId: process.env.META_APP_ID || '',
      systemToken: process.env.META_SYSTEM_TOKEN || '',
    },
    rateLimits: {
      maxPostsPerDay: parseInt(process.env.FACEBOOK_MAX_POSTS_DAY || '100', 10),
      maxPostsPerHour: parseInt(process.env.FACEBOOK_MAX_POSTS_HOUR || '10', 10),
      minIntervalMs: parseInt(process.env.FACEBOOK_MIN_INTERVAL_MS || '300000', 10), // 5min
    },
    features: {
      text: true,
      image: true,
      video: true,
      carousel: true,
      story: true,
      reel: true,
      link: true,
    },
    contentLimits: {
      maxTextLength: 63206,
      maxHashtags: 30,
      maxImages: 10,
      maxVideoSizeMB: 4096,
    },
  },

  instagram: {
    enabled: process.env.INSTAGRAM_ENABLED !== 'false',
    apiType: (process.env.INSTAGRAM_API_TYPE as 'late' | 'direct') || 'direct',
    credentials: {
      businessAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
      accessToken: process.env.FACEBOOK_PAGE_TOKEN || '', // IG uses the page token via Meta Graph API
    },
    rateLimits: {
      maxPostsPerDay: parseInt(process.env.INSTAGRAM_MAX_POSTS_DAY || '25', 10),
      maxPostsPerHour: parseInt(process.env.INSTAGRAM_MAX_POSTS_HOUR || '5', 10),
      minIntervalMs: parseInt(process.env.INSTAGRAM_MIN_INTERVAL_MS || '600000', 10), // 10min
    },
    features: {
      text: false, // IG requires media
      image: true,
      video: true,
      carousel: true,
      story: true,
      reel: true,
      link: false, // Link in bio only
    },
    contentLimits: {
      maxTextLength: 2200,
      maxHashtags: 30,
      maxImages: 10,
      maxVideoSizeMB: 3600, // 1h reel
    },
  },

  tiktok: {
    enabled: process.env.TIKTOK_ENABLED === 'true',
    apiType: (process.env.TIKTOK_API_TYPE as 'late' | 'direct') || 'direct',
    credentials: {
      appId: process.env.TIKTOK_APP_ID || '',
      appSecret: process.env.TIKTOK_APP_SECRET || '',
      accessToken: process.env.TIKTOK_ACCESS_TOKEN || '',
    },
    rateLimits: {
      maxPostsPerDay: parseInt(process.env.TIKTOK_MAX_POSTS_DAY || '50', 10),
      maxPostsPerHour: parseInt(process.env.TIKTOK_MAX_POSTS_HOUR || '5', 10),
      minIntervalMs: parseInt(process.env.TIKTOK_MIN_INTERVAL_MS || '600000', 10),
    },
    features: {
      text: false,
      image: false,
      video: true,
      carousel: false,
      story: false,
      reel: false,
      link: false,
    },
    contentLimits: {
      maxTextLength: 2200,
      maxHashtags: 5,
      maxImages: 0,
      maxVideoSizeMB: 287,
    },
  },

  twitter: {
    enabled: process.env.TWITTER_ENABLED === 'true',
    apiType: (process.env.TWITTER_API_TYPE as 'late' | 'direct') || 'direct',
    credentials: {
      apiKey: process.env.TWITTER_API_KEY || '',
      apiSecret: process.env.TWITTER_API_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
      bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    },
    rateLimits: {
      maxPostsPerDay: parseInt(process.env.TWITTER_MAX_POSTS_DAY || '200', 10),
      maxPostsPerHour: parseInt(process.env.TWITTER_MAX_POSTS_HOUR || '50', 10),
      minIntervalMs: parseInt(process.env.TWITTER_MIN_INTERVAL_MS || '60000', 10), // 1min
    },
    features: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      story: false,
      reel: false,
      link: true,
    },
    contentLimits: {
      maxTextLength: 280,
      maxHashtags: 5,
      maxImages: 4,
      maxVideoSizeMB: 512,
    },
  },

  linkedin: {
    enabled: process.env.LINKEDIN_ENABLED === 'true',
    apiType: (process.env.LINKEDIN_API_TYPE as 'late' | 'direct') || 'direct',
    credentials: {
      clientId: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN || '',
      organizationId: process.env.LINKEDIN_ORG_ID || '',
    },
    rateLimits: {
      maxPostsPerDay: parseInt(process.env.LINKEDIN_MAX_POSTS_DAY || '10', 10),
      maxPostsPerHour: parseInt(process.env.LINKEDIN_MAX_POSTS_HOUR || '2', 10),
      minIntervalMs: parseInt(process.env.LINKEDIN_MIN_INTERVAL_MS || '1800000', 10), // 30min
    },
    features: {
      text: true,
      image: true,
      video: true,
      carousel: true,
      story: false,
      reel: false,
      link: true,
    },
    contentLimits: {
      maxTextLength: 3000,
      maxHashtags: 10,
      maxImages: 9,
      maxVideoSizeMB: 5120,
    },
  },

  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED !== 'false',
    apiType: 'direct',
    credentials: {
      businessPhoneId: process.env.WHATSAPP_PHONE_ID || '',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    },
    rateLimits: {
      maxPostsPerDay: parseInt(process.env.WHATSAPP_MAX_BROADCASTS_DAY || '50', 10),
      maxPostsPerHour: parseInt(process.env.WHATSAPP_MAX_BROADCASTS_HOUR || '10', 10),
      minIntervalMs: parseInt(process.env.WHATSAPP_MIN_INTERVAL_MS || '300000', 10),
    },
    features: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      story: true,
      reel: false,
      link: true,
    },
    contentLimits: {
      maxTextLength: 4096,
      maxHashtags: 0,
      maxImages: 1,
      maxVideoSizeMB: 16,
    },
  },
};

/**
 * Get enabled platforms
 */
export function getEnabledPlatforms(): SocialChannel[] {
  return (Object.entries(platformConfigs) as [SocialChannel, PlatformConfig][])
    .filter(([, cfg]) => cfg.enabled)
    .map(([channel]) => channel);
}

/**
 * Validate platform credentials
 */
export function validatePlatformCredentials(): { platform: SocialChannel; valid: boolean; missing: string[] }[] {
  return (Object.entries(platformConfigs) as [SocialChannel, PlatformConfig][])
    .filter(([, cfg]) => cfg.enabled)
    .map(([channel, cfg]) => {
      const missing = Object.entries(cfg.credentials)
        .filter(([, value]) => !value)
        .map(([key]) => key);
      return { platform: channel, valid: missing.length === 0, missing };
    });
}
