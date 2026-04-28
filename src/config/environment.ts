// src/config/environment.ts
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),

  POSTGRES_HOST: process.env.POSTGRES_HOST || 'localhost',
  POSTGRES_PORT: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  POSTGRES_USER: process.env.POSTGRES_USER || 'social_dispatcher_user',
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'social_dispatcher_password',
  POSTGRES_DB: process.env.POSTGRES_DB || 'social_dispatcher_db',

  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),

  META_APP_ID: process.env.META_APP_ID || '',
  META_SYSTEM_TOKEN: process.env.META_SYSTEM_TOKEN || '',
  META_API_VERSION: process.env.META_API_VERSION || 'v19.0',

  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',

  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'a_very_secret_key_of_32_chars_for_encryption', // MUST be 32 bytes for AES-256
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  QUEUE_SOCIAL_POST: process.env.QUEUE_SOCIAL_POST || 'social-post-queue',
  QUEUE_SOCIAL_STORY: process.env.QUEUE_SOCIAL_STORY || 'social-story-queue',
  QUEUE_SOCIAL_WHATSAPP: process.env.QUEUE_SOCIAL_WHATSAPP || 'social-whatsapp-queue',
  QUEUE_SOCIAL_AB_TEST: process.env.QUEUE_SOCIAL_AB_TEST || 'social-ab-test-queue',
  QUEUE_SOCIAL_RATE_LIMIT: process.env.QUEUE_SOCIAL_RATE_LIMIT || 'social-rate-limit-queue',
};

// Validate essential environment variables
if (!env.META_APP_ID || !env.META_SYSTEM_TOKEN) {
  console.warn('WARNING: META_APP_ID or META_SYSTEM_TOKEN are not set. Meta API interactions may fail.');
}
if (env.ENCRYPTION_KEY.length !== 32) {
  console.warn('WARNING: ENCRYPTION_KEY is not 32 characters long. Encryption/Decryption may fail.');
}
