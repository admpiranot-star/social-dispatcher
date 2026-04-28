/**
 * Social Network Discovery
 * Script para descobrir todas as contas do PiraNOT em Meta e outras plataformas
 * Usa Meta API + configuração manual para descobrir Pages, Instagram Accounts, etc
 */

import axios from 'axios';
import { query } from '../db/client';
import { logger } from '../lib/logger';
import { Account } from '../types';

const GRAPH_API_URL = 'https://graph.instagram.com';

export class NetworkDiscovery {
  /**
   * Descobrir todas as Facebook Pages e Instagram Business Accounts
   * Usa Meta System User Token para acessar Business Accounts
   */
  async discoverMetaAccounts(systemToken: string): Promise<Account[]> {
    const accounts: Account[] = [];

    try {
      logger.info({}, 'Iniciando descoberta de contas Meta (Facebook + Instagram)');

      // 1. Descobrir Facebook Pages usando o token do sistema
      const pagesResponse = await axios.get(
        `${GRAPH_API_URL.replace('instagram.com', 'facebook.com')}/me/accounts`,
        {
          params: {
            access_token: systemToken,
            fields: 'id,name,category,followers_count,fan_count',
          },
        }
      );

      // 2. Para cada página, tentar descobrir Instagram Business Account vinculado
      for (const page of pagesResponse.data.data) {
        try {
          // Página Facebook
          const fbAccount: Account = {
            id: `fb-${page.id}`,
            accountName: page.name,
            platform: 'facebook',
            externalId: page.id,
            followerCount: page.fan_count || 0,
            isMain: false,
            distributionWeight: 1.0,
            webhookVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          accounts.push(fbAccount);
          logger.info({ pageId: page.id, pageName: page.name }, 'Facebook Page descoberta');

          // Tentar descobrir Instagram Business Account
          const igResponse = await axios.get(`${GRAPH_API_URL}/me/instagram_business_account`, {
            params: { access_token: systemToken },
          });

          if (igResponse.data.instagram_business_account) {
            const igAccount: Account = {
              id: `ig-${igResponse.data.instagram_business_account.id}`,
              accountName: `${page.name} (Instagram)`,
              platform: 'instagram',
              externalId: igResponse.data.instagram_business_account.id,
              followerCount: igResponse.data.instagram_business_account.followers_count || 0,
              isMain: false,
              distributionWeight: 1.0,
              webhookVerified: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            accounts.push(igAccount);
            logger.info(
              { igAccountId: igResponse.data.instagram_business_account.id },
              'Instagram Business Account descoberta'
            );
          }
        } catch (pageErr: any) {
          logger.warn({ pageId: page.id, error: pageErr.message }, 'Erro ao descobrir IG da página');
        }
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao descobrir contas Meta');
      throw err;
    }

    return accounts;
  }

  /**
   * Descobrir contas TikTok (via configuração manual no .env)
   * TikTok não tem Business Account API pública, então usamos config estática
   */
  async discoverTikTokAccounts(config: Record<string, any>): Promise<Account[]> {
    const accounts: Account[] = [];

    if (config.TIKTOK_ACCOUNTS) {
      const tiktokAccounts = JSON.parse(config.TIKTOK_ACCOUNTS);
      for (const account of tiktokAccounts) {
        accounts.push({
          id: `tiktok-${account.id}`,
          accountName: account.name,
          platform: 'tiktok',
          externalId: account.id,
          followerCount: account.followers || 0,
          isMain: account.isMain || false,
          distributionWeight: account.weight || 1.0,
          webhookVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return accounts;
  }

  /**
   * Descobrir contas Twitter/X
   */
  async discoverTwitterAccounts(config: Record<string, any>): Promise<Account[]> {
    const accounts: Account[] = [];

    if (config.TWITTER_ACCOUNTS) {
      const twitterAccounts = JSON.parse(config.TWITTER_ACCOUNTS);
      for (const account of twitterAccounts) {
        accounts.push({
          id: `twitter-${account.id}`,
          accountName: account.name,
          platform: 'twitter',
          externalId: account.id,
          followerCount: account.followers || 0,
          isMain: account.isMain || false,
          distributionWeight: account.weight || 1.0,
          webhookVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return accounts;
  }

  /**
   * Descobrir contas LinkedIn
   */
  async discoverLinkedInAccounts(config: Record<string, any>): Promise<Account[]> {
    const accounts: Account[] = [];

    if (config.LINKEDIN_ACCOUNTS) {
      const linkedinAccounts = JSON.parse(config.LINKEDIN_ACCOUNTS);
      for (const account of linkedinAccounts) {
        accounts.push({
          id: `linkedin-${account.id}`,
          accountName: account.name,
          platform: 'linkedin',
          externalId: account.id,
          followerCount: account.followers || 0,
          isMain: account.isMain || false,
          distributionWeight: account.weight || 1.0,
          webhookVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return accounts;
  }

  /**
   * Rodar descoberta completa: Meta + TikTok + Twitter + LinkedIn
   */
  async discoverAll(systemToken: string, config: Record<string, any>): Promise<Account[]> {
    logger.info({}, '🔍 Iniciando descoberta completa de rede social');

    const allAccounts: Account[] = [];

    try {
      // Descobrir contas Meta (Facebook + Instagram)
      const metaAccounts = await this.discoverMetaAccounts(systemToken);
      allAccounts.push(...metaAccounts);

      // Descobrir TikTok
      const tiktokAccounts = await this.discoverTikTokAccounts(config);
      allAccounts.push(...tiktokAccounts);

      // Descobrir Twitter
      const twitterAccounts = await this.discoverTwitterAccounts(config);
      allAccounts.push(...twitterAccounts);

      // Descobrir LinkedIn
      const linkedinAccounts = await this.discoverLinkedInAccounts(config);
      allAccounts.push(...linkedinAccounts);

      logger.info(
        { totalAccounts: allAccounts.length, platforms: [...new Set(allAccounts.map((a) => a.platform))] },
        '✅ Descoberta completa'
      );

      return allAccounts;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro na descoberta completa');
      throw err;
    }
  }

  /**
   * Registrar todas as contas descobertas no banco de dados
   */
  async registerAccounts(accounts: Account[]): Promise<void> {
    logger.info({ count: accounts.length }, 'Registrando contas no banco de dados');

    for (const account of accounts) {
      try {
        await query(
          `INSERT INTO social_accounts_extended (id, account_name, follower_count, category_focus, is_main, distribution_weight, webhook_verified, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id) DO UPDATE SET
           account_name = $2, follower_count = $3, distribution_weight = $6, updated_at = NOW()`,
          [
            account.id,
            account.accountName,
            account.followerCount,
            account.categoryFocus || 'main',
            account.isMain,
            account.distributionWeight,
            account.webhookVerified,
          ]
        );

        logger.info({ accountId: account.id, name: account.accountName }, 'Conta registrada');
      } catch (err: any) {
        logger.error({ accountId: account.id, error: err.message }, 'Erro ao registrar conta');
      }
    }
  }
}

export const networkDiscovery = new NetworkDiscovery();
