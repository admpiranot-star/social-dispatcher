/**
 * Social Account Registry
 * CRUD para gerenciar contas sociais descobertas
 */

import { query, queryOne } from '../db/client';
import { logger } from '../lib/logger';
import { Account, SocialChannel } from '../types';

export class AccountRegistry {
  /**
   * Listar todas as contas
   */
  async listAll(): Promise<Account[]> {
    try {
      const result = await query(`
        SELECT id, account_name, platform, external_id, follower_count,
               category_focus, is_main, distribution_weight, webhook_verified,
               created_at, updated_at
        FROM social_accounts_extended
        ORDER BY is_main DESC, follower_count DESC
      `);

      return result.rows.map((row: any) => this.mapRowToAccount(row));
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao listar contas');
      throw err;
    }
  }

  /**
   * Listar contas por plataforma
   */
  async listByPlatform(platform: SocialChannel): Promise<Account[]> {
    try {
      const result = await query(
        `
        SELECT id, account_name, platform, external_id, follower_count,
               category_focus, is_main, distribution_weight, webhook_verified,
               created_at, updated_at
        FROM social_accounts_extended
        WHERE platform = $1
        ORDER BY is_main DESC, follower_count DESC
      `,
        [platform]
      );

      return result.rows.map((row: any) => this.mapRowToAccount(row));
    } catch (err: any) {
      logger.error({ error: err.message, platform }, 'Erro ao listar contas por plataforma');
      throw err;
    }
  }

  /**
   * Buscar conta por ID
   */
  async getById(accountId: string): Promise<Account | null> {
    try {
      const result = await queryOne(
        `
        SELECT id, account_name, platform, external_id, follower_count,
               category_focus, is_main, distribution_weight, webhook_verified,
               created_at, updated_at
        FROM social_accounts_extended
        WHERE id = $1
      `,
        [accountId]
      );

      return result ? this.mapRowToAccount(result) : null;
    } catch (err: any) {
      logger.error({ error: err.message, accountId }, 'Erro ao buscar conta');
      throw err;
    }
  }

  /**
   * Atualizar conta
   */
  async update(accountId: string, updates: Partial<Account>): Promise<Account> {
    try {
      const account = await this.getById(accountId);
      if (!account) throw new Error(`Account ${accountId} not found`);

      const updated = await queryOne(
        `
        UPDATE social_accounts_extended
        SET account_name = COALESCE($2, account_name),
            follower_count = COALESCE($3, follower_count),
            category_focus = COALESCE($4, category_focus),
            is_main = COALESCE($5, is_main),
            distribution_weight = COALESCE($6, distribution_weight),
            webhook_verified = COALESCE($7, webhook_verified),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, account_name, platform, external_id, follower_count,
                  category_focus, is_main, distribution_weight, webhook_verified,
                  created_at, updated_at
      `,
        [
          accountId,
          updates.accountName || null,
          updates.followerCount || null,
          updates.categoryFocus || null,
          updates.isMain !== undefined ? updates.isMain : null,
          updates.distributionWeight || null,
          updates.webhookVerified !== undefined ? updates.webhookVerified : null,
        ]
      );

      logger.info({ accountId }, 'Conta atualizada');
      return this.mapRowToAccount(updated);
    } catch (err: any) {
      logger.error({ error: err.message, accountId }, 'Erro ao atualizar conta');
      throw err;
    }
  }

  /**
   * Deletar conta
   */
  async delete(accountId: string): Promise<void> {
    try {
      await query('DELETE FROM social_accounts_extended WHERE id = $1', [accountId]);
      logger.info({ accountId }, 'Conta deletada');
    } catch (err: any) {
      logger.error({ error: err.message, accountId }, 'Erro ao deletar conta');
      throw err;
    }
  }

  /**
   * Listar contas principais (is_main = true)
   */
  async listMainAccounts(): Promise<Account[]> {
    try {
      const result = await query(`
        SELECT id, account_name, platform, external_id, follower_count,
               category_focus, is_main, distribution_weight, webhook_verified,
               created_at, updated_at
        FROM social_accounts_extended
        WHERE is_main = TRUE
        ORDER BY platform
      `);

      return result.rows.map((row: any) => this.mapRowToAccount(row));
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao listar contas principais');
      throw err;
    }
  }

  /**
   * Listar contas por categoria (ex: 'politics', 'tech', 'entertainment')
   */
  async listByCategory(category: string): Promise<Account[]> {
    try {
      const result = await query(
        `
        SELECT id, account_name, platform, external_id, follower_count,
               category_focus, is_main, distribution_weight, webhook_verified,
               created_at, updated_at
        FROM social_accounts_extended
        WHERE category_focus = $1
        ORDER BY follower_count DESC
      `,
        [category]
      );

      return result.rows.map((row: any) => this.mapRowToAccount(row));
    } catch (err: any) {
      logger.error({ error: err.message, category }, 'Erro ao listar por categoria');
      throw err;
    }
  }

  /**
   * Marcar webhook como verificado
   */
  async markWebhookVerified(accountId: string): Promise<void> {
    try {
      await query('UPDATE social_accounts_extended SET webhook_verified = TRUE WHERE id = $1', [accountId]);
      logger.info({ accountId }, 'Webhook marcado como verificado');
    } catch (err: any) {
      logger.error({ error: err.message, accountId }, 'Erro ao marcar webhook verificado');
      throw err;
    }
  }

  /**
   * Obter estatísticas da rede
   */
  async getNetworkStats(): Promise<{
    totalAccounts: number;
    totalFollowers: number;
    accountsByPlatform: Record<string, number>;
    mainAccounts: number;
  }> {
    try {
      const result = await queryOne(`
        SELECT
          COUNT(*) as total_accounts,
          SUM(follower_count) as total_followers,
          SUM(CASE WHEN is_main = TRUE THEN 1 ELSE 0 END) as main_accounts,
          json_object_agg(platform, platform_count) as accounts_by_platform
        FROM (
          SELECT platform, COUNT(*) as platform_count
          FROM social_accounts_extended
          GROUP BY platform
        ) AS platform_counts
      `);

      return {
        totalAccounts: parseInt(result.total_accounts),
        totalFollowers: parseInt(result.total_followers || 0),
        mainAccounts: parseInt(result.main_accounts || 0),
        accountsByPlatform: result.accounts_by_platform || {},
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao obter estatísticas');
      throw err;
    }
  }

  /**
   * Helper: Mapear linha do banco para objeto Account
   */
  private mapRowToAccount(row: any): Account {
    return {
      id: row.id,
      accountName: row.account_name,
      platform: row.platform,
      externalId: row.external_id,
      followerCount: row.follower_count,
      categoryFocus: row.category_focus,
      isMain: row.is_main,
      distributionWeight: row.distribution_weight,
      webhookVerified: row.webhook_verified,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const accountRegistry = new AccountRegistry();
