/**
 * Auth Middleware
 * P0 #9: Bearer token validation + optional role-based access
 */

import type { Context, Next } from 'hono';
import { config } from '../../config';
import { logger } from '../../lib/logger';

type UserRole = 'admin' | 'editor';

/**
 * Creates an auth middleware that validates Bearer tokens
 * and optionally checks X-User-Role header.
 *
 * @param requiredRole - Optional role check via X-User-Role header
 * @returns Hono middleware function
 */
export function createAuthMiddleware(requiredRole?: UserRole) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    const clientIp = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown';
    const path = c.req.path;
    const method = c.req.method;

    // Check Authorization header exists
    if (!authHeader) {
      logger.warn(
        { clientIp, path, method },
        'Auth failed: missing Authorization header'
      );
      return c.json(
        { error: 'Unauthorized', message: 'Authorization header is required' },
        401
      );
    }

    // Validate Bearer format
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn(
        { clientIp, path, method },
        'Auth failed: invalid Authorization format'
      );
      return c.json(
        { error: 'Unauthorized', message: 'Authorization must use Bearer scheme' },
        401
      );
    }

    const token = authHeader.slice(7); // 'Bearer '.length

    // Validate token (constant-time comparison would be ideal, but
    // for a single API_TOKEN check this is acceptable)
    if (!token || token !== config.API_TOKEN) {
      logger.warn(
        { clientIp, path, method },
        'Auth failed: invalid token'
      );
      return c.json(
        { error: 'Unauthorized', message: 'Invalid or expired token' },
        401
      );
    }

    // Optional role check
    if (requiredRole) {
      const userRole = c.req.header('X-User-Role') as UserRole | undefined;

      if (!userRole) {
        logger.warn(
          { clientIp, path, method, requiredRole },
          'Auth failed: missing X-User-Role header'
        );
        return c.json(
          { error: 'Forbidden', message: `Role '${requiredRole}' is required` },
          403
        );
      }

      const roleHierarchy: Record<UserRole, number> = {
        editor: 1,
        admin: 2,
      };

      const userLevel = roleHierarchy[userRole];
      const requiredLevel = roleHierarchy[requiredRole];

      if (userLevel === undefined || userLevel < requiredLevel) {
        logger.warn(
          { clientIp, path, method, userRole, requiredRole },
          'Auth failed: insufficient role'
        );
        return c.json(
          { error: 'Forbidden', message: `Role '${requiredRole}' is required, got '${userRole}'` },
          403
        );
      }
    }

    // Auth passed
    return next();
  };
}
