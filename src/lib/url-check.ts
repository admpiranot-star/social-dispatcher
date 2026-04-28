/**
 * URL Liveness Checker
 * Verifica se uma URL está acessível antes de postar nas redes sociais.
 * Evita publicar links de matérias que foram removidas do site.
 */

import { logger } from './logger';

export interface UrlCheckResult {
  alive: boolean;
  statusCode: number;
  redirectUrl?: string;
  durationMs: number;
  error?: string;
}

/**
 * Verifica se uma URL está acessível (HTTP 200 ou 301/302).
 * Usa HEAD request para ser leve (sem baixar o body).
 * Timeout de 10s por padrão.
 */
export async function checkUrlAlive(
  url: string,
  timeoutMs: number = 10000
): Promise<UrlCheckResult> {
  const startTime = Date.now();

  if (!url || !url.startsWith('http')) {
    return {
      alive: false,
      statusCode: 0,
      durationMs: Date.now() - startTime,
      error: 'Invalid URL',
    };
  }

  const tryGet = async (): Promise<UrlCheckResult> => {
    const getResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'PiraNOT-SocialDispatcher/1.0 (link-check)',
      },
    });

    const durationMs = Date.now() - startTime;
    const alive = getResponse.status >= 200 && getResponse.status < 400;
    return {
      alive,
      statusCode: getResponse.status,
      redirectUrl: getResponse.redirected ? getResponse.url : undefined,
      durationMs,
    };
  };

  try {
    // Use HEAD first (lighter), fallback to GET when HEAD is blocked or inconclusive.
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'PiraNOT-SocialDispatcher/1.0 (link-check)',
      },
    });

    const durationMs = Date.now() - startTime;
    const alive = response.status >= 200 && response.status < 400;

    if (alive) {
      return {
        alive: true,
        statusCode: response.status,
        redirectUrl: response.redirected ? response.url : undefined,
        durationMs,
      };
    }

    if (response.status >= 400) {
      try {
        const getResult = await tryGet();
        if (getResult.alive) {
          logger.info(
            { url, headStatusCode: response.status, getStatusCode: getResult.statusCode },
            '[url-check] HEAD failed but GET succeeded'
          );
        }
        return getResult;
      } catch {
        // Keep original HEAD result below
      }
    }

    logger.warn(
      { url, statusCode: response.status, durationMs },
      '[url-check] URL is not accessible'
    );

    return {
      alive: false,
      statusCode: response.status,
      redirectUrl: response.redirected ? response.url : undefined,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // If HEAD fails, try GET (some servers block HEAD)
    if (err.name !== 'TimeoutError') {
      try {
        return await tryGet();
      } catch {
        // Fall through to error return below
      }
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ url, error: errMsg, durationMs }, '[url-check] URL check failed');

    return {
      alive: false,
      statusCode: 0,
      durationMs,
      error: errMsg,
    };
  }
}
