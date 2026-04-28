import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../lib/logger';
import { TokenExpiryError } from '../types';
import { query } from '../db/client';

const redis = new Redis(config.REDIS_URL);
const TOKEN_CACHE_PREFIX = 'social:token:';
const TOKEN_BUFFER_SECONDS = 600; // 10 min before expiry

export class TokenManager {
  async getValidToken(accountId: string): Promise<string> {
    const cacheKey = `${TOKEN_CACHE_PREFIX}${accountId}`;

    // 1. Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ accountId }, 'Token from cache');
      return cached;
    }

    // 2. Fetch from DB
    const account = await query(
      'SELECT access_token_encrypted, token_expires_at FROM social_accounts WHERE id = $1',
      [accountId]
    );

    if (!account.rows[0]) {
      throw new Error('Account not found');
    }

    const { access_token_encrypted, token_expires_at } = account.rows[0];

    // 3. Check expiry
    if (token_expires_at) {
      const expiryTime = new Date(token_expires_at).getTime();
      const now = Date.now();
      if (expiryTime - now < TOKEN_BUFFER_SECONDS * 1000) {
        throw new TokenExpiryError('Token expired or expiring soon');
      }
    }

    // 4. Cache token
    const ttl = token_expires_at
      ? Math.max(Math.floor((new Date(token_expires_at).getTime() - Date.now()) / 1000) - TOKEN_BUFFER_SECONDS, 60)
      : 3600;

    await redis.setex(cacheKey, ttl, access_token_encrypted);

    return access_token_encrypted;
  }

  async invalidateToken(accountId: string): Promise<void> {
    await redis.del(`${TOKEN_CACHE_PREFIX}${accountId}`);
    logger.info({ accountId }, 'Token invalidated');
  }

  async isTokenValid(accountId: string): Promise<boolean> {
    try {
      await this.getValidToken(accountId);
      return true;
    } catch {
      return false;
    }
  }
}

export const tokenManager = new TokenManager();
