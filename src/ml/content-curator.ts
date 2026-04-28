/**
 * Content Curator Engine
 * 
 * Filtra, prioriza e seleciona conteúdo do WordPress para distribuição
 * nas páginas Facebook, com curadoria inteligente por categoria e geografia.
 *
 * Fluxo:
 *   WordPress API → fetch recent posts → filtrar por categoria/geo →
 *   priorizar por qualidade → enfileirar no Dispatcher
 *
 * Critérios de priorização:
 *   1. Urgência (breaking news) → priority 10
 *   2. Exclusividade (conteúdo local) → priority 8
 *   3. Relevância regional → priority 7
 *   4. Interesse geral → priority 5
 *   5. Entretenimento/curiosidade → priority 3
 */

import { query } from '../db/client';
import { logger } from '../lib/logger';
import type { SocialPostPayload, SocialChannel } from '../types';
import type { ContentCategory } from '../config/pages';

// =====================================================================
// Tipos
// =====================================================================

export interface CuratedArticle {
  id: string;
  title: string;
  link: string;
  summary: string;
  category: ContentCategory;
  wpCategory: string;
  priority: number;
  publishedAt: Date;
  featuredImage?: string;
  authorName?: string;
}

export interface CuratorConfig {
  maxArticles: number;
  minFetchIntervalMinutes: number;
  wpApiUrl: string;
  categoryMap: Record<string, ContentCategory>;
  skipCategories: string[];
  localBoost: number;
}

export interface CuratorStats {
  lastFetch: Date;
  articlesFetched: number;
  articlesCurated: number;
  articlesDispatched: number;
  articlesSkipped: number;
  errors: number;
}

// =====================================================================
// Default config
// =====================================================================

const DEFAULT_CONFIG: CuratorConfig = {
  maxArticles: 20,
  minFetchIntervalMinutes: 15,
  wpApiUrl: 'https://piranot.com.br/wp-json/wp/v2',
  categoryMap: {
    'politica': 'politics',
    'politica-nacional': 'politics',
    'politica-local': 'politics',
    'economia': 'economy',
    'negocios': 'economy',
    'esportes': 'sports',
    'futebol': 'sports',
    'tecnologia': 'technology',
    'ciencia': 'technology',
    'entretenimento': 'entertainment',
    'cultura': 'entertainment',
    'tv-e-famosos': 'entertainment',
    'loterias': 'lotteries',
    'mega-sena': 'lotteries',
    'policia': 'police',
    'policial': 'police',
    'noticias-policiais': 'police',
    'empregos': 'jobs',
    'vagas': 'jobs',
    'concursos': 'jobs',
    'carreiras': 'jobs',
    'receitas': 'recipes',
    'culinaria': 'recipes',
    'gastronomia': 'recipes',
  },
  skipCategories: [
    'uncategorized',
    'sem-categoria',
    'teste',
  ],
  localBoost: 2,
};

// =====================================================================
// Engine
// =====================================================================

export class ContentCurator {
  private config: CuratorConfig;
  private stats: CuratorStats;
  private categoryIdToSlug: Map<number, string> = new Map();
  private categoriesLoaded = false;

  constructor(config: Partial<CuratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = this.defaultStats();
  }

  async curate(): Promise<CuratedArticle[]> {
    const startTime = Date.now();
    
    try {
      // Ensure WP categories are loaded lazily
      await this.loadWpCategories();

      const rawArticles = await this.fetchWpArticles();
      this.stats.articlesFetched = rawArticles.length;
      this.stats.lastFetch = new Date();

      logger.info({ count: rawArticles.length }, 'Curator: artigos brutos do WordPress');

      if (rawArticles.length === 0) {
        return [];
      }

      const curated: CuratedArticle[] = [];
      let skipped = 0;

      for (const raw of rawArticles) {
        const alreadyDone = await this.isAlreadyDispatched(raw.link);
        if (alreadyDone) {
          skipped++;
          continue;
        }

        const contentCat = this.mapCategory(raw.wpCategory);

        if (this.config.skipCategories.includes(raw.wpCategory)) {
          skipped++;
          continue;
        }

        const priority = this.calculatePriority(raw, contentCat);

        curated.push({
          id: raw.id,
          title: raw.title,
          link: raw.link,
          summary: raw.summary,
          category: contentCat,
          wpCategory: raw.wpCategory,
          priority,
          publishedAt: raw.publishedAt,
          featuredImage: raw.featuredImage,
          authorName: raw.authorName,
        });
      }

      this.stats.articlesCurated = curated.length;
      this.stats.articlesSkipped = skipped;

      curated.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.publishedAt.getTime() - a.publishedAt.getTime();
      });

      const limited = curated.slice(0, this.config.maxArticles);

      logger.info(
        {
          fetched: rawArticles.length,
          curated: limited.length,
          skipped,
          durationMs: Date.now() - startTime,
        },
        'Curator: curadoria concluida'
      );

      return limited;
    } catch (err: any) {
      this.stats.errors++;
      logger.error({ error: err.message }, 'Curator: erro na curadoria');
      return [];
    }
  }

  toDispatchPayloads(articles: CuratedArticle[]): SocialPostPayload[] {
    return articles.map(a => ({
      id: `curated_${a.id}`,
      title: a.title,
      link: a.link,
      summary: a.summary,
      category: a.category,
      priority: a.priority,
      channels: ['facebook' as SocialChannel],
      imageUrl: a.featuredImage,
      metadata: {
        sourceId: a.id.toString(),
        utmCampaign: 'auto-curator',
        utmSource: 'wordpress',
        utmMedium: 'social',
      },
    }));
  }

  getStats(): CuratorStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = this.defaultStats();
  }

  // =====================================================================
  // Internals
  // =====================================================================

  private defaultStats(): CuratorStats {
    return {
      lastFetch: new Date(0),
      articlesFetched: 0,
      articlesCurated: 0,
      articlesDispatched: 0,
      articlesSkipped: 0,
      errors: 0,
    };
  }

  private async fetchWpArticles(): Promise<Array<{
    id: string;
    title: string;
    link: string;
    summary: string;
    wpCategory: string;
    publishedAt: Date;
    featuredImage?: string;
    authorName?: string;
  }>> {
    const oneDayAgo = new Date(Date.now() - 24 * 3600000);
    const afterParam = oneDayAgo.toISOString();

    const url = `${this.config.wpApiUrl}/posts?per_page=50&after=${encodeURIComponent(afterParam)}&_fields=id,title,link,excerpt,categories,date,featured_media,_links`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PiraNOT-Social-Dispatcher/2.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`WP API returned ${response.status}: ${response.statusText}`);
    }

    const posts = await response.json() as any[];

    return posts.map((p: any) => {
      const wpCatId = p.categories?.[0] || 1;
      const wpCatSlug = this.categoryIdToSlug.get(wpCatId) || 'uncategorized';

      return {
        id: p.id?.toString() || '',
        title: decodeHtml(p.title?.rendered || 'Sem titulo'),
        link: p.link || '',
        summary: decodeHtml(p.excerpt?.rendered || '').replace(/<[^>]*>/g, '').slice(0, 300),
        wpCategory: wpCatSlug,
        publishedAt: new Date(p.date || Date.now()),
        featuredImage: p._links?.['wp:featuredmedia']?.[0]?.href || undefined,
        authorName: p._links?.author?.[0]?.href ? 'autor' : undefined,
      };
    });
  }

  private mapCategory(wpSlug: string): ContentCategory {
    return this.config.categoryMap[wpSlug] || 'other';
  }

  private calculatePriority(raw: any, contentCat: ContentCategory): number {
    let priority = 5;

    if (raw.title?.toLowerCase().includes('urgente') || 
        raw.title?.toLowerCase().includes('breaking') ||
        raw.title?.toLowerCase().includes('ultima hora')) {
      priority = 10;
    }
    else if (contentCat === 'police' || contentCat === 'jobs') {
      priority = 7;
    }
    else if (contentCat === 'entertainment' || contentCat === 'recipes') {
      priority = 3;
    }
    else {
      priority = 5;
    }

    const ageHours = (Date.now() - raw.publishedAt?.getTime()) / 3600000;
    if (ageHours < 2) priority = Math.min(10, priority + 2);
    else if (ageHours < 6) priority = Math.min(10, priority + 1);

    return priority;
  }

  /**
   * Load WordPress category taxonomy (ID → slug). Called once lazily.
   */
  private async loadWpCategories(): Promise<void> {
    if (this.categoriesLoaded) return;

    try {
      const url = `${this.config.wpApiUrl}/categories?per_page=100&_fields=id,slug`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'PiraNOT-Dispatcher/2.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const cats = await response.json() as any[];
        for (const cat of cats) {
          if (cat.id && cat.slug) {
            this.categoryIdToSlug.set(Number(cat.id), String(cat.slug));
          }
        }
        this.categoriesLoaded = true;
        logger.info({ count: this.categoryIdToSlug.size }, 'Curator: WP categories loaded');
      } else {
        logger.warn({}, 'Curator: WP categories API failed, using fallback IDs');
        this.categoriesLoaded = true;
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Curator: failed to load WP categories');
      this.categoriesLoaded = true;
    }
  }

  private async isAlreadyDispatched(link: string): Promise<boolean> {
    try {
      const result = await query(
        "SELECT COUNT(*) as cnt FROM posts WHERE link = $1 AND created_at > NOW() - INTERVAL '24 hours'",
        [link]
      );
      return parseInt(result.rows[0]?.cnt || '0') > 0;
    } catch {
      return false;
    }
  }
}

// =====================================================================
// HTML entity decoder (standalone function, no em-dash issues)
// =====================================================================

function decodeHtml(html: string): string {
  return html
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&mdash;/g, '--')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

// =====================================================================
// Singleton
// =====================================================================

export const contentCurator = new ContentCurator();
