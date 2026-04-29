/**
 * Ramp-Up Engine — Dormant Page Revival
 *
 * Classifica cada página em uma fase de reativação e aplica limites
 * progressivos de frequência + regras de conteúdo para evitar
 * shadowban do algoritmo do Facebook.
 *
 * Fases:
 *   dormant  → 0 posts nos últimos 30 dias → máx 1/dia, só fotos nativas
 *   warming  → 1-7 posts nos últimos 30 dias → máx 2/dia, mix foto+local
 *   active   → 8+ posts nos últimos 30 dias → máx 5/dia, tudo liberado
 *   saturated → 30+ posts nos últimos 30 dias → sem limite
 *
 * Regras de segurança:
 *   - dormant/warming: SEM links externos (Facebook penaliza)
 *   - Intervalo mínimo progressivo: 3h → 1h → 30min
 *   - Se erro de spam → pausa automática 24h
 */

import { query } from '../db/client';
import { logger } from '../lib/logger';
import type { PageConfig } from '../config/pages';
import Redis from 'ioredis';

// =====================================================================
// Tipos
// =====================================================================

export type RampUpPhase = 'dormant' | 'warming' | 'active' | 'saturated';

export interface PageRampUpState {
  pageId: string;
  pageName: string;
  phase: RampUpPhase;
  postsLast30d: number;
  postsToday: number;
  maxPostsPerDay: number;
  minIntervalMinutes: number;
  allowLinks: boolean;
  allowExternalLinks: boolean;
  cooldownUntil: Date | null; // se em cooldown por spam
}

export interface RampUpDecision {
  allowed: boolean;
  reason: string;
  limit: RampUpDecisionLimit;
}

export interface RampUpDecisionLimit {
  maxPostsPerDay: number;
  postsToday: number;
  remaining: number;
  minIntervalMinutes: number;
  allowLinks: boolean;
}

// =====================================================================
// Engine
// =====================================================================

export class RampUpEngine {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  /**
   * Avalia o estado atual de uma página e retorna a decisão de ramp-up.
   * NUNCA lança exceção — em caso de erro, permite o post (fail-open).
   */
  async evaluate(page: PageConfig, now: Date = new Date()): Promise<RampUpState> {
    try {
      const state = await this.computeState(page, now);
      return { ok: true, state };
    } catch (err: any) {
      logger.warn({ pageId: page.id, error: err.message }, 'RampUp: erro ao avaliar — permitindo post');
      return {
        ok: true,
        state: this.defaultState(page),
      };
    }
  }

  /**
   * Verifica se um post específico pode ser enfileirado para esta página,
   * com base nos limites atuais de ramp-up.
   */
  async canPost(page: PageConfig, hasExternalLink: boolean, now: Date = new Date()): Promise<RampUpDecision> {
    const { state } = await this.evaluate(page, now);

    // Cooldown por spam?
    if (state.cooldownUntil && state.cooldownUntil > now) {
      const remainingMin = Math.ceil((state.cooldownUntil.getTime() - now.getTime()) / 60000);
      return {
        allowed: false,
        reason: `Página em cooldown por spam — libera em ${remainingMin}min`,
        limit: toDecision(state),
      };
    }

    // Já atingiu o limite diário?
    if (state.postsToday >= state.maxPostsPerDay) {
      return {
        allowed: false,
        reason: `Limite diário atingido (${state.postsToday}/${state.maxPostsPerDay})`,
        limit: toDecision(state),
      };
    }

    // Link externo em fase que não permite?
    if (hasExternalLink && !state.allowExternalLinks) {
      return {
        allowed: false,
        reason: `Fase ${state.phase} não permite links externos — apenas conteúdo nativo`,
        limit: toDecision(state),
      };
    }

    // Link de qualquer tipo em fase dormant?
    if (state.phase === 'dormant' && hasExternalLink) {
      return {
        allowed: false,
        reason: 'Fase dormant: apenas fotos/vídeos nativos, sem links',
        limit: toDecision(state),
      };
    }

    return {
      allowed: true,
      reason: `OK — ${state.postsToday}/${state.maxPostsPerDay} posts hoje, fase ${state.phase}`,
      limit: toDecision(state),
    };
  }

  /**
   * Registra um cooldown na página (ex: após erro de spam do Facebook).
   */
  async setCooldown(pageId: string, durationHours: number = 24): Promise<void> {
    try {
      const until = new Date(Date.now() + durationHours * 3600000);
      await query(
        `INSERT INTO ramp_up_state (page_id, cooldown_until, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (page_id) DO UPDATE SET cooldown_until = $2, updated_at = NOW()`,
        [pageId, until]
      );
      logger.warn({ pageId, cooldownUntil: until }, 'RampUp: cooldown ativado');
    } catch (err: any) {
      logger.error({ pageId, error: err.message }, 'RampUp: erro ao setar cooldown');
    }
  }

  /**
   * Força uma página para uma fase específica (uso manual/admin).
   */
  async forcePhase(pageId: string, phase: RampUpPhase): Promise<void> {
    try {
      await query(
        `INSERT INTO ramp_up_state (page_id, forced_phase, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (page_id) DO UPDATE SET forced_phase = $2, updated_at = NOW()`,
        [pageId, phase]
      );
      logger.info({ pageId, phase }, 'RampUp: fase forçada manualmente');
    } catch (err: any) {
      logger.error({ pageId, error: err.message }, 'RampUp: erro ao forçar fase');
    }
  }

  /**
   * Retorna o estado de TODAS as páginas para dashboard.
   */
  async getAllStates(): Promise<PageRampUpState[]> {
    const result = await query(
      `SELECT page_id, phase, posts_last_30d, posts_today,
              max_posts_per_day, min_interval_minutes,
              allow_links, allow_external_links, cooldown_until
       FROM ramp_up_state
       ORDER BY posts_today DESC`
    );
    return result.rows.map((r: any) => ({
      pageId: r.page_id,
      pageName: '', // preenchido por quem chama
      phase: r.phase as RampUpPhase,
      postsLast30d: parseInt(r.posts_last_30d || '0'),
      postsToday: parseInt(r.posts_today || '0'),
      maxPostsPerDay: parseInt(r.max_posts_per_day || '1'),
      minIntervalMinutes: parseInt(r.min_interval_minutes || '180'),
      allowLinks: r.allow_links,
      allowExternalLinks: r.allow_external_links,
      cooldownUntil: r.cooldown_until ? new Date(r.cooldown_until) : null,
    }));
  }

  // =====================================================================
  // Internals
  // =====================================================================

  private async computeState(page: PageConfig, now: Date): Promise<PageRampUpState> {
    // 1. Contar posts nos últimos 30 dias para esta página
    const posts30d = await this.countPostsLast30d(page.id);
    const postsToday = await this.countPostsToday(page.id);

    // 2. Verificar se há fase forçada
    const forcedResult = await query(
      `SELECT forced_phase, cooldown_until FROM ramp_up_state WHERE page_id = $1`,
      [page.id]
    );

    let forcedPhase: RampUpPhase | null = null;
    let cooldownUntil: Date | null = null;

    if (forcedResult.rows.length > 0) {
      forcedPhase = forcedResult.rows[0].forced_phase as RampUpPhase | null;
      const cd = forcedResult.rows[0].cooldown_until;
      cooldownUntil = cd ? new Date(cd) : null;
    }

    // 3. Determinar fase — USAR SEGUIDORES como critério principal
    //    Páginas com audiência grande NÃO são dormant, mesmo sem posts no sistema.
    //    Uma página de 156K seguidores é ACTIVE por natureza.
    let phase: RampUpPhase;
    if (forcedPhase) {
      phase = forcedPhase;
    } else if (page.followers >= 10000) {
      // Páginas grandes: active ou saturated, dependendo do volume
      phase = posts30d >= 30 ? 'saturated' : 'active';
    } else if (page.followers >= 2000) {
      // Páginas médias: warming → active → saturated conforme cresce
      if (posts30d >= 15) phase = 'saturated';
      else if (posts30d > 0 || page.followers >= 5000) phase = 'active';
      else phase = 'warming';
    } else if (page.followers >= 500) {
      // Páginas pequenas: warming prudente
      phase = 'warming';
    } else {
      // Páginas muito novas/tiny: dormant
      phase = 'dormant';
    }

    // 4. Definir limites por fase
    const limits = PHASE_LIMITS[phase];

    // 5. Persistir estado atualizado
    await this.upsertState(page.id, page.name, phase, posts30d, postsToday, limits);

    return {
      pageId: page.id,
      pageName: page.name,
      phase,
      postsLast30d: posts30d,
      postsToday,
      maxPostsPerDay: limits.maxPostsPerDay,
      minIntervalMinutes: limits.minIntervalMinutes,
      allowLinks: limits.allowLinks,
      allowExternalLinks: limits.allowExternalLinks,
      cooldownUntil,
    };
  }

  private async countPostsLast30d(pageId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as cnt FROM posts
       WHERE platform_post_id = $1
         AND status = 'published'
         AND created_at > NOW() - INTERVAL '30 days'`,
      [pageId]
    );
    return parseInt(result.rows[0]?.cnt || '0');
  }

  private async countPostsToday(pageId: string): Promise<number> {
    // Count from Redis atomic counter (reset daily)
    const key = `rampup:daily:${pageId}`;
    try {
      const val = await this.redis.get(key);
      if (val === null) {
        // Set with TTL = seconds until midnight
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const ttlSec = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
        await this.redis.setex(key, ttlSec, '0');
        return 0;
      }
      return parseInt(val || '0');
    } catch {
      // Fallback: count from job_logs
      const result = await query(
        `SELECT COUNT(*) as cnt FROM job_logs
         WHERE account_id = $1 AND created_at > CURRENT_DATE`,
        [pageId]
      );
      return parseInt(result.rows[0]?.cnt || '0');
    }
  }

  /** Increment daily counter for a page (called after successful enqueue). */
  async incrementDailyCounter(pageId: string): Promise<void> {
    const key = `rampup:daily:${pageId}`;
    try {
      const val = await this.redis.get(key);
      if (val === null) {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const ttlSec = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
        await this.redis.setex(key, ttlSec, '1');
      } else {
        await this.redis.incr(key);
      }
    } catch {
      // silently fail — counter is best-effort
    }
  }

  private async upsertState(
    pageId: string,
    pageName: string,
    phase: RampUpPhase,
    posts30d: number,
    postsToday: number,
    limits: PhaseLimits,
  ): Promise<void> {
    await query(
      `INSERT INTO ramp_up_state (page_id, page_name, phase, posts_last_30d, posts_today,
         max_posts_per_day, min_interval_minutes, allow_links, allow_external_links, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (page_id) DO UPDATE SET
         page_name = $2,
         phase = $3,
         posts_last_30d = $4,
         posts_today = $5,
         max_posts_per_day = $6,
         min_interval_minutes = $7,
         allow_links = $8,
         allow_external_links = $9,
         updated_at = NOW()`,
      [pageId, pageName, phase, posts30d, postsToday,
       limits.maxPostsPerDay, limits.minIntervalMinutes,
       limits.allowLinks, limits.allowExternalLinks]
    );
  }

  private defaultState(page: PageConfig): PageRampUpState {
    return {
      pageId: page.id,
      pageName: page.name,
      phase: 'active',
      postsLast30d: 0,
      postsToday: 0,
      maxPostsPerDay: 5,
      minIntervalMinutes: 30,
      allowLinks: true,
      allowExternalLinks: true,
      cooldownUntil: null,
    };
  }
}

// =====================================================================
// Helpers (outside class)
// =====================================================================

function toDecision(state: PageRampUpState): RampUpDecisionLimit {
  return {
    maxPostsPerDay: state.maxPostsPerDay,
    postsToday: state.postsToday,
    remaining: Math.max(0, state.maxPostsPerDay - state.postsToday),
    minIntervalMinutes: state.minIntervalMinutes,
    allowLinks: state.allowLinks,
  };
}

// =====================================================================
// Init function — called from server startup
// =====================================================================

export async function initRampUp(): Promise<void> {
  await query(RAMP_UP_SCHEMA);
  logger.info({}, 'RampUp: schema criado/verificado');
}

// =====================================================================
// Configuração de limites por fase
// =====================================================================

interface PhaseLimits {
  maxPostsPerDay: number;
  minIntervalMinutes: number;
  allowLinks: boolean;
  allowExternalLinks: boolean;
}

const PHASE_LIMITS: Record<RampUpPhase, PhaseLimits> = {
  dormant: {
    maxPostsPerDay: 1,
    minIntervalMinutes: 180, // 3 horas
    allowLinks: false,
    allowExternalLinks: false,
  },
  warming: {
    maxPostsPerDay: 5,
    minIntervalMinutes: 60, // 1 hora
    allowLinks: true,        // links p/ piranot.com.br são OK
    allowExternalLinks: false,
  },
  active: {
    maxPostsPerDay: 15,
    minIntervalMinutes: 30,
    allowLinks: true,
    allowExternalLinks: true,
  },
  saturated: {
    maxPostsPerDay: 30,
    minIntervalMinutes: 15,
    allowLinks: true,
    allowExternalLinks: true,
  },
};

// =====================================================================
// Schema SQL (executar na inicialização)
// =====================================================================

export const RAMP_UP_SCHEMA = `
CREATE TABLE IF NOT EXISTS ramp_up_state (
  page_id              VARCHAR(50) PRIMARY KEY,
  page_name            VARCHAR(200) NOT NULL DEFAULT '',
  phase                VARCHAR(20) NOT NULL DEFAULT 'dormant',
  posts_last_30d       INTEGER NOT NULL DEFAULT 0,
  posts_today          INTEGER NOT NULL DEFAULT 0,
  max_posts_per_day    INTEGER NOT NULL DEFAULT 1,
  min_interval_minutes INTEGER NOT NULL DEFAULT 180,
  allow_links          BOOLEAN NOT NULL DEFAULT false,
  allow_external_links BOOLEAN NOT NULL DEFAULT false,
  forced_phase         VARCHAR(20),
  cooldown_until       TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ramp_up_phase ON ramp_up_state(phase);
`;

// =====================================================================
// Singleton
// =====================================================================

export const rampUpEngine = new RampUpEngine();

// =====================================================================
// Helper types
// =====================================================================

export interface RampUpState {
  ok: true;
  state: PageRampUpState;
}
