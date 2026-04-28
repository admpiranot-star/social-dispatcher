// src/types/index.d.ts

export type Platform = 'facebook' | 'instagram' | 'whatsapp';
export type PostStatus = 'pending' | 'dispatched' | 'failed' | 'scheduled';
export type ABTestStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface SocialAccount {
  id: string;
  platform: Platform;
  platform_user_id: string;
  access_token: string;
  token_expires_at?: Date;
  refresh_token?: string;
  app_id?: string;
  app_secret?: string;
  config?: any; // JSONB type
  created_at: Date;
  updated_at: Date;
}

export interface Post {
  id: string;
  social_account_id: string;
  platform: Platform;
  content?: string;
  media_url?: string[];
  scheduled_at?: Date;
  dispatched_at?: Date;
  status: PostStatus;
  platform_post_id?: string;
  error_message?: string;
  ab_test_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ABTest {
  id: string;
  name: string;
  description?: string;
  status: ABTestStatus;
  start_time?: Date;
  end_time?: Date;
  config?: any; // JSONB type
  results?: any; // JSONB type
  created_at: Date;
  updated_at: Date;
}

export interface SocialPostJob {
  socialAccountId: string;
  platform: Platform;
  content?: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  abTestId?: string;
}

export interface SocialStoryJob extends SocialPostJob {
  // Specific fields for stories if any
}

export interface WhatsAppJob {
  socialAccountId: string;
  phoneNumber: string;
  message: string;
  template?: any;
  abTestId?: string;
}

export interface RateLimitJob {
  platform: Platform;
  socialAccountId?: string; // Optional, can be global or per account
  apiEndpoint: string;
  retryAfterSeconds: number;
}
