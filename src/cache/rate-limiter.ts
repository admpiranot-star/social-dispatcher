import Redis from 'ioredis';
import { config } from '../config';
import { RateLimitError } from '../types';

const redis = new Redis(config.REDIS_URL);
const RATE_LIMIT_KEY = 'social:rate-limit:';
const WINDOW_MS = 60000; // 1 minute

export class RateLimiter {
  async checkLimit(tokenId: string): Promise<boolean> {
    const key = `${RATE_LIMIT_KEY}${tokenId}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, Math.ceil(WINDOW_MS / 1000));
    }

    if (current > config.RATE_LIMIT_PER_MIN) {
      const ttl = await redis.ttl(key);
      throw new RateLimitError(ttl || 60);
    }

    return true;
  }

  async getRemainingRequests(tokenId: string): Promise<number> {
    const key = `${RATE_LIMIT_KEY}${tokenId}`;
    const current = await redis.get(key);
    return Math.max(0, config.RATE_LIMIT_PER_MIN - (parseInt(current || '0', 10)));
  }
}

export const rateLimiter = new RateLimiter();
