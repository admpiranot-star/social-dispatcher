import dotenv from 'dotenv';

dotenv.config({ path: '.env.social' });

export interface Config {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL: string;
  REDIS_URL: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  API_TOKEN: string;

  // Meta Credentials
  META_APP_ID: string;
  META_SYSTEM_TOKEN: string;
  META_API_VERSION: string;
  FACEBOOK_PAGE_ID: string;
  FACEBOOK_PAGE_TOKEN: string;
  INSTAGRAM_ACCOUNT_ID: string;

  // Meta Webhook
  META_WEBHOOK_VERIFY_TOKEN: string;

  // Rate Limiting
  RATE_LIMIT_PER_MIN: number;
  CIRCUIT_BREAKER_THRESHOLD: number;
  CIRCUIT_BREAKER_RESET_MS: number;

  // Timing & Scheduling
  SCHEDULER_TIMEZONE: string;
  MAX_POSTS_PER_DAY: number;

  // Feature Flags
  ENABLE_AB_TESTING: boolean;
  ENABLE_TIMING_OPTIMIZATION: boolean;
}

export const config: Config = {
  PORT: parseInt(process.env.PORT || '3302', 10),
  NODE_ENV: (process.env.NODE_ENV as any) || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/social_dispatcher',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  LOG_LEVEL: (process.env.LOG_LEVEL as any) || 'info',
  API_TOKEN: process.env.API_TOKEN || (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('⚠️  API_TOKEN must be set in production!'); })()
    : 'dev-token-change-in-production'),

  META_APP_ID: process.env.META_APP_ID || '',
  META_SYSTEM_TOKEN: process.env.META_SYSTEM_TOKEN || '',
  META_API_VERSION: process.env.META_API_VERSION || 'v19.0',
  FACEBOOK_PAGE_ID: process.env.FACEBOOK_PAGE_ID || '',
  FACEBOOK_PAGE_TOKEN: process.env.FACEBOOK_PAGE_TOKEN || '',
  INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID || '',

  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN || '',

  RATE_LIMIT_PER_MIN: parseInt(process.env.RATE_LIMIT_PER_MIN || '120', 10),
  CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
  CIRCUIT_BREAKER_RESET_MS: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '60000', 10),

  SCHEDULER_TIMEZONE: process.env.SCHEDULER_TIMEZONE || 'America/Sao_Paulo',
  MAX_POSTS_PER_DAY: parseInt(process.env.MAX_POSTS_PER_DAY || '100', 10),

  ENABLE_AB_TESTING: process.env.ENABLE_AB_TESTING !== 'false',
  ENABLE_TIMING_OPTIMIZATION: process.env.ENABLE_TIMING_OPTIMIZATION !== 'false',
};

export function validateConfig(): void {
  const required = ['META_SYSTEM_TOKEN', 'FACEBOOK_PAGE_ID', 'DATABASE_URL', 'REDIS_URL'];
  for (const key of required) {
    if (!config[key as keyof Config]) {
      console.warn(`⚠️ Missing required config: ${key}`);
    }
  }
}
