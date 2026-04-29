/**
 * Multi-Page Distribution Configuration
 * ======================================
 * Mapeia todas as 17 páginas Facebook + 2 contas Instagram do ecossistema PiraNOT.
 *
 * Estratégia de distribuição:
 * - Cada artigo é roteado para as páginas relevantes com base em categoria, geo e beat
 * - Horários variam por segmento para alcançar diferentes públicos
 * - Páginas principais (PIRA NOT, JCardoso) recebem tudo
 * - Páginas regionais recebem conteúdo geo-filtrado
 * - Páginas temáticas recebem conteúdo de categoria específica
 *
 * Tokens: Cada página tem seu próprio page access token (derivado do System User token).
 * Todos expiram em 0 (never) pois são tokens de System User.
 */

export type PageTier = 'primary' | 'secondary' | 'regional' | 'thematic' | 'personal';
export type GeoScope = 'piracicaba' | 'campinas' | 'sorocaba' | 'sumare' | 'indaiatuba' | 'rio_claro' | 'limeira' | 'sao_paulo' | 'nacional' | 'all';
export type ContentCategory = 'politics' | 'economy' | 'sports' | 'technology' | 'entertainment' | 'lotteries' | 'police' | 'jobs' | 'recipes' | 'other';

export interface ScheduleWindow {
  /** Hours in BRT (0-23) */
  startHour: number;
  endHour: number;
  /** Days: 0=Sun, 1=Mon, ... 6=Sat. Empty = all days */
  days?: number[];
}

export interface PageConfig {
  id: string;
  name: string;
  pageToken: string;
  tier: PageTier;
  followers: number;

  /** Instagram business account linked to this page (if any) */
  instagram?: {
    accountId: string;
    username: string;
    followers: number;
  };

  /** Content routing rules */
  routing: {
    /** Categories this page accepts. Empty = all categories */
    categories: ContentCategory[];
    /** Geographic scope. 'all' = accepts any geo */
    geoScopes: GeoScope[];
    /** If true, receives all breaking/urgent news regardless of category/geo */
    receivesBreaking: boolean;
    /** If true, this page receives all content (main distribution hub) */
    receivesAll: boolean;
  };

  /** Scheduling strategy */
  schedule: {
    /** Posting windows (BRT). Posts are distributed across these windows */
    windows: ScheduleWindow[];
    /** Minimum minutes between posts on this page (normal content) */
    minIntervalMinutes: number;
    /** Minimum minutes between posts during breaking/plantão (longer to avoid flooding) */
    minIntervalBreakingMinutes: number;
    /** Maximum posts per day on this page */
    maxPostsPerDay: number;
    /** Base delay offset in minutes (to stagger posts across pages) */
    staggerOffsetMinutes: number;
  };

  /** Message customization */
  messaging: {
    /** Prefix added before the article title */
    prefix?: string;
    /** Suffix added after the message (before hashtags) */
    suffix?: string;
    /** Additional hashtags specific to this page */
    extraHashtags?: string[];
    /** Whether to include link preview (Facebook) */
    includeLinkPreview: boolean;
  };

  /** Whether this page is currently active for automated posting */
  enabled: boolean;
}

/**
 * All Facebook pages + Instagram accounts in the PiraNOT ecosystem.
 * Page tokens from Meta Graph API (System User token, never expires).
 */
export const PAGES: PageConfig[] = [
  // ═══════════════════════════════════════════════════════════════
  // TIER: PRIMARY — Main news hubs, receive ALL content
  // ═══════════════════════════════════════════════════════════════
  {
    id: '198240126857753',
    name: 'PIRA NOT',
    pageToken: process.env.FB_TOKEN_PIRANOT || '',
    tier: 'primary',
    followers: 208046,
    instagram: {
      accountId: '17841400090428292',
      username: 'piranot',
      followers: 150444,
    },
    routing: {
      categories: [],
      geoScopes: ['all'],
      receivesBreaking: true,
      receivesAll: true,
    },
    schedule: {
      windows: [
        { startHour: 0, endHour: 6 },    // Madrugada (notícia não para)
        { startHour: 6, endHour: 10 },   // Manhã cedo
        { startHour: 11, endHour: 14 },   // Almoço
        { startHour: 17, endHour: 21 },   // Fim do dia
        { startHour: 22, endHour: 24 },   // Noite
      ],
      minIntervalMinutes: 30,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 50,
      staggerOffsetMinutes: 0,
    },
    messaging: {
      includeLinkPreview: true,
      extraHashtags: ['#Piracicaba', '#InteriorSP'],
    },
    enabled: false,   // Desabilitada: não postar automaticamente na PIRA NOT principal
  },

  {
    id: '557057011352925',
    name: 'JCardoso - Jornalista PIRA NOT',
    pageToken: process.env.FB_TOKEN_JCARDOSO || '',
    tier: 'primary',
    followers: 156408,
    routing: {
      categories: [],
      geoScopes: ['all'],
      receivesBreaking: true,
      receivesAll: true,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 11 },   // Manhã (offset da PIRA NOT)
        { startHour: 12, endHour: 15 },   // Tarde
        { startHour: 18, endHour: 22 },   // Noite
      ],
      minIntervalMinutes: 30,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 40,
      staggerOffsetMinutes: 30,            // 30min depois da PIRA NOT
    },
    messaging: {
      prefix: 'JCardoso |',
      includeLinkPreview: true,
      extraHashtags: ['#JCardoso'],
    },
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER: SECONDARY — Topical hubs with significant audience
  // ═══════════════════════════════════════════════════════════════
  {
    id: '253853868089537',
    name: 'Guia PIRA NOT',
    pageToken: process.env.FB_TOKEN_GUIA || '',
    tier: 'secondary',
    followers: 35065,
    instagram: {
      accountId: '17841449649505164',
      username: 'bastidorespiranot',
      followers: 1906,
    },
    routing: {
      categories: [],                        // Aceita TODAS as categorias (local/regional)
      geoScopes: ['piracicaba', 'campinas', 'sorocaba', 'sumare', 'indaiatuba', 'rio_claro', 'limeira', 'nacional'],
      receivesBreaking: true,
      receivesAll: true,                   // Hub regional prioritário
    },
    schedule: {
      windows: [
        { startHour: 9, endHour: 12 },
        { startHour: 15, endHour: 19 },
      ],
      minIntervalMinutes: 15,
      minIntervalBreakingMinutes: 60,
      maxPostsPerDay: 40,
      staggerOffsetMinutes: 60,
    },
    messaging: {
      includeLinkPreview: true,
      extraHashtags: ['#GuiaPiraNOT'],
    },
    enabled: true,
  },

  {
    id: '358434294259640',
    name: 'Notícias policiais',
    pageToken: process.env.FB_TOKEN_POLICIAL || '',
    tier: 'secondary',
    followers: 7535,
    routing: {
      categories: ['police'],
      geoScopes: ['all'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 6, endHour: 23 },    // Notícias policiais = qualquer hora
      ],
      minIntervalMinutes: 30,
      minIntervalBreakingMinutes: 60,
      maxPostsPerDay: 20,
      staggerOffsetMinutes: 60,
    },
    messaging: {
      includeLinkPreview: true,
      extraHashtags: ['#Policia', '#Seguranca', '#NoticiasRB'],
    },
    enabled: true,
  },

  {
    id: '775191289166599',
    name: 'Empregos em São Paulo',
    pageToken: process.env.FB_TOKEN_EMPREGOS || '',
    tier: 'secondary',
    followers: 9523,
    routing: {
      categories: ['jobs'],
      geoScopes: ['sao_paulo', 'all'],
      receivesBreaking: false,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 10, days: [1, 2, 3, 4, 5] },  // Dias úteis manhã
        { startHour: 14, endHour: 17, days: [1, 2, 3, 4, 5] },  // Dias úteis tarde
      ],
      minIntervalMinutes: 60,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 8,
      staggerOffsetMinutes: 90,
    },
    messaging: {
      includeLinkPreview: true,
      extraHashtags: ['#Empregos', '#Vagas', '#SP', '#TrabalhoSP'],
    },
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER: REGIONAL — City-specific pages
  // ═══════════════════════════════════════════════════════════════
  {
    id: '151625298364783',
    name: 'Notícias de Campinas',
    pageToken: process.env.FB_TOKEN_CAMPINAS || '',
    tier: 'regional',
    followers: 13752,
    routing: {
      categories: [],
      geoScopes: ['campinas'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 9 },
        { startHour: 12, endHour: 14 },
        { startHour: 18, endHour: 20 },
      ],
      minIntervalMinutes: 30,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 12,
      staggerOffsetMinutes: 90,
    },
    messaging: {
      prefix: 'Campinas |',
      includeLinkPreview: true,
      extraHashtags: ['#Campinas', '#RMC'],
    },
    enabled: true,
  },

  {
    id: '1644329419170433',
    name: 'Noticias de Sorocaba',
    pageToken: process.env.FB_TOKEN_SOROCABA || '',
    tier: 'regional',
    followers: 2287,
    routing: {
      categories: [],
      geoScopes: ['sorocaba'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 9 },
        { startHour: 12, endHour: 14 },
        { startHour: 18, endHour: 20 },
      ],
      minIntervalMinutes: 45,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 8,
      staggerOffsetMinutes: 120,
    },
    messaging: {
      prefix: 'Sorocaba |',
      includeLinkPreview: true,
      extraHashtags: ['#Sorocaba'],
    },
    enabled: true,
  },

  {
    id: '1632801123617243',
    name: 'Notícias de Sumaré',
    pageToken: process.env.FB_TOKEN_SUMARE || '',
    tier: 'regional',
    followers: 4343,
    routing: {
      categories: [],
      geoScopes: ['sumare'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 9 },
        { startHour: 12, endHour: 14 },
        { startHour: 18, endHour: 20 },
      ],
      minIntervalMinutes: 45,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 8,
      staggerOffsetMinutes: 150,
    },
    messaging: {
      prefix: 'Sumaré |',
      includeLinkPreview: true,
      extraHashtags: ['#Sumare', '#RMC'],
    },
    enabled: true,
  },

  {
    id: '751231718324812',
    name: 'Indaiatuba empregos e notícias',
    pageToken: process.env.FB_TOKEN_INDAIATUBA || '',
    tier: 'regional',
    followers: 6842,
    routing: {
      categories: [],
      geoScopes: ['indaiatuba'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 9 },
        { startHour: 12, endHour: 14 },
        { startHour: 18, endHour: 20 },
      ],
      minIntervalMinutes: 45,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 8,
      staggerOffsetMinutes: 180,
    },
    messaging: {
      prefix: 'Indaiatuba |',
      includeLinkPreview: true,
      extraHashtags: ['#Indaiatuba'],
    },
    enabled: true,
  },

  {
    id: '1527736807484683',
    name: 'Rio Claro Pira NOT',
    pageToken: process.env.FB_TOKEN_RIOCLARO || '',
    tier: 'regional',
    followers: 996,
    routing: {
      categories: [],
      geoScopes: ['rio_claro'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 9 },
        { startHour: 12, endHour: 14 },
        { startHour: 18, endHour: 20 },
      ],
      minIntervalMinutes: 60,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 6,
      staggerOffsetMinutes: 210,
    },
    messaging: {
      prefix: 'Rio Claro |',
      includeLinkPreview: true,
      extraHashtags: ['#RioClaro'],
    },
    enabled: true,
  },

  {
    id: '343523079136003',
    name: 'Limeira Pira NOT',
    pageToken: process.env.FB_TOKEN_LIMEIRA || process.env.FB_TOKEN_PIRANOT || '',
    tier: 'regional',
    followers: 1885,
    routing: {
      categories: [],
      geoScopes: ['limeira'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 7, endHour: 9 },
        { startHour: 12, endHour: 14 },
        { startHour: 18, endHour: 20 },
      ],
      minIntervalMinutes: 60,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 6,
      staggerOffsetMinutes: 240,
    },
    messaging: {
      prefix: 'Limeira |',
      includeLinkPreview: true,
      extraHashtags: ['#Limeira'],
    },
    enabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER: THEMATIC — Niche content pages
  // ═══════════════════════════════════════════════════════════════
  {
    id: '462227500775885',
    name: 'Porjuca',
    pageToken: process.env.FB_TOKEN_PORJUCA || '',
    tier: 'thematic',
    followers: 953,
    routing: {
      categories: ['entertainment', 'sports'],
      geoScopes: ['piracicaba'],
      receivesBreaking: false,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 10, endHour: 14 },
        { startHour: 19, endHour: 22 },
      ],
      minIntervalMinutes: 60,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 5,
      staggerOffsetMinutes: 270,
    },
    messaging: {
      includeLinkPreview: true,
      extraHashtags: ['#Porjuca', '#Piracicaba'],
    },
    enabled: true,
  },

  {
    id: '181092322027246',
    name: 'Receitas rápidas e fáceis',
    pageToken: process.env.FB_TOKEN_RECEITAS || process.env.FB_TOKEN_PIRANOT || '',
    tier: 'thematic',
    followers: 542,
    routing: {
      categories: ['recipes'],
      geoScopes: ['all'],
      receivesBreaking: false,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 10, endHour: 12 },
        { startHour: 16, endHour: 18 },
      ],
      minIntervalMinutes: 120,
      minIntervalBreakingMinutes: 120,
      maxPostsPerDay: 3,
      staggerOffsetMinutes: 270,
    },
    messaging: {
      includeLinkPreview: true,
      extraHashtags: ['#Receitas', '#Cozinha', '#ReceitaFacil'],
    },
    enabled: true,
  },

  {
    id: '339555452841664',
    name: 'TV online Brasil',
    pageToken: process.env.FB_TOKEN_TVONLINE || process.env.FB_TOKEN_PIRANOT || '',
    tier: 'thematic',
    followers: 41,
    routing: {
      categories: ['entertainment', 'technology'],
      geoScopes: ['nacional'],
      receivesBreaking: false,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 12, endHour: 22 },
      ],
      minIntervalMinutes: 120,
      minIntervalBreakingMinutes: 120,
      maxPostsPerDay: 3,
      staggerOffsetMinutes: 300,
    },
    messaging: {
      includeLinkPreview: true,
      extraHashtags: ['#TVOnline', '#Brasil'],
    },
    enabled: false,   // Small audience, activate later
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER: PERSONAL — Personal/corporate pages
  // ═══════════════════════════════════════════════════════════════
  {
    id: '613124515526093',
    name: 'Página "Junior Cardoso"',
    pageToken: process.env.FB_TOKEN_JUNIOR || '',
    tier: 'personal',
    followers: 2992,
    routing: {
      categories: ['politics', 'economy'],
      geoScopes: ['all'],
      receivesBreaking: true,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 8, endHour: 20 },
      ],
      minIntervalMinutes: 60,
      minIntervalBreakingMinutes: 90,
      maxPostsPerDay: 5,
      staggerOffsetMinutes: 120,
    },
    messaging: {
      prefix: 'Opinião |',
      includeLinkPreview: true,
    },
    enabled: true,
  },

  {
    id: '1193981313967993',
    name: 'JCOM Agência de Notícias',
    pageToken: process.env.FB_TOKEN_JCOM || '',
    tier: 'personal',
    followers: 11,
    routing: {
      categories: [],
      geoScopes: ['all'],
      receivesBreaking: false,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5] },
      ],
      minIntervalMinutes: 120,
      minIntervalBreakingMinutes: 120,
      maxPostsPerDay: 3,
      staggerOffsetMinutes: 300,
    },
    messaging: {
      prefix: 'JCOM |',
      includeLinkPreview: true,
    },
    enabled: false,    // Very small audience, activate later
  },

  {
    id: '1407760882858519',
    name: 'Megapromo',
    pageToken: process.env.FB_TOKEN_MEGAPROMO || '',
    tier: 'personal',
    followers: 60,
    routing: {
      categories: ['economy'],
      geoScopes: ['all'],
      receivesBreaking: false,
      receivesAll: false,
    },
    schedule: {
      windows: [
        { startHour: 10, endHour: 18 },
      ],
      minIntervalMinutes: 180,
      minIntervalBreakingMinutes: 180,
      maxPostsPerDay: 2,
      staggerOffsetMinutes: 330,
    },
    messaging: {
      prefix: 'Promo |',
      includeLinkPreview: true,
      extraHashtags: ['#Promocao', '#Oferta'],
    },
    enabled: false,    // Specialized, activate later
  },
];

/**
 * Get all enabled pages
 */
export function getEnabledPages(): PageConfig[] {
  return PAGES.filter(p => p.enabled);
}

/**
 * Get pages that should receive a given article based on category and geo.
 *
 * Routing logic:
 * 1. Pages with receivesAll=true always match
 * 2. Pages with receivesBreaking=true match if isBreaking=true
 * 3. Otherwise, page must match BOTH category AND geo (or accept 'all')
 */
export function routeArticle(opts: {
  category: ContentCategory;
  geoScope?: GeoScope;
  isBreaking?: boolean;
  articleId?: string; // para deduplicação
}): PageConfig[] {
  const enabled = getEnabledPages();
  const matched: PageConfig[] = [];
  // === ANTI-SHADOWBAN: roteamento inteligente ===
  // Mesma notícia NÃO vai pra todas as páginas. Estratégia:
  // 1. Hub pages (receivesAll) recebem TUDO — mas são só 1-2
  // 2. Breaking news → todas as páginas que aceitam breaking
  // 3. Notícias normais → NO MÁXIMO 3 páginas por artigo
  //    - 1 página de melhor match (categoria + geo)
  //    - 1-2 páginas de match secundário (aleatório entre matches)
  // 4. Mesmo link NUNCA vai pra mais de 3 páginas simultaneamente

  const MAX_PAGES_PER_ARTICLE = opts.isBreaking ? 10 : 3; // breaking pode ir pra mais

  // Páginas hub (receivesAll) SEMPRE recebem
  const hubPages = enabled.filter(p => p.routing.receivesAll);
  for (const page of hubPages) {
    matched.push(page);
  }

  if (matched.length >= MAX_PAGES_PER_ARTICLE) {
    return matched.slice(0, MAX_PAGES_PER_ARTICLE);
  }

  // Breaking: todas as páginas que aceitam breaking
  if (opts.isBreaking) {
    for (const page of enabled) {
      if (matched.find(m => m.id === page.id)) continue; // já incluída
      if (page.routing.receivesBreaking) {
        matched.push(page);
      }
    }
    return matched.slice(0, MAX_PAGES_PER_ARTICLE);
  }

  // Notícias normais: categorizar matches
  const categoryMatches: PageConfig[] = [];
  const geoMatches: PageConfig[] = [];

  for (const page of enabled) {
    if (matched.find(m => m.id === page.id)) continue; // já é hub

    const categoryMatch =
      page.routing.categories.length === 0 ||
      page.routing.categories.includes(opts.category);

    const geoMatch =
      page.routing.geoScopes.includes('all') ||
      (opts.geoScope && page.routing.geoScopes.includes(opts.geoScope));

    if (categoryMatch && geoMatch) {
      // Match duplo (categoria + geo) = prioritário
      categoryMatches.push(page);
    } else if (categoryMatch || geoMatch) {
      // Match parcial = secundário
      geoMatches.push(page);
    }
  }

  // Adicionar matches prioritários (shuffle para variar a rota a cada artigo)
  const shuffledPrimary = shuffleArray(categoryMatches);
  for (const page of shuffledPrimary) {
    if (matched.length >= MAX_PAGES_PER_ARTICLE) break;
    matched.push(page);
  }

  // Completar com matches secundários se sobrar vaga
  const shuffledSecondary = shuffleArray(geoMatches);
  for (const page of shuffledSecondary) {
    if (matched.length >= MAX_PAGES_PER_ARTICLE) break;
    matched.push(page);
  }

  return matched;
}

/**
 * Fisher-Yates shuffle — embaralha array sem modificar o original.
 * Isso garante que cada artigo vai pra páginas DIFERENTES a cada execução,
 * evitando o padrão de "mesmas N páginas recebem tudo".
 */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    Math.random(); // usar Math.random é suficiente pra roteamento
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Calculate the scheduled time for a post on a specific page,
 * applying the page's stagger offset and schedule windows.
 *
 * Returns the next available time within the page's schedule windows,
 * offset by the page's stagger minutes.
 */
export function calculatePageScheduleTime(page: PageConfig, baseTime: Date, priority: number = 5): Date {
  const offset = page.schedule.staggerOffsetMinutes;
  const staggered = new Date(baseTime.getTime() + offset * 60_000);

  // P0 #11: Emergency/Priority 10 posts bypass windows
  if (priority >= 10) {
    return staggered;
  }

  // Get current BRT hour (UTC-3)
  const brtHour = (staggered.getUTCHours() - 3 + 24) % 24;
  const brtDay = staggered.getUTCDay();

  // Check if staggered time falls within any schedule window
  for (const window of page.schedule.windows) {
    const dayMatch = !window.days || window.days.length === 0 || window.days.includes(brtDay);
    if (!dayMatch) continue;

    // Handle windows that cross midnight (e.g., 22-1)
    const inWindow = window.startHour <= window.endHour
      ? brtHour >= window.startHour && brtHour < window.endHour
      : brtHour >= window.startHour || brtHour < window.endHour;

    if (inWindow) return staggered;
  }

  // If not in any window, find next available window
  // Move forward hour by hour until we find a valid window
  const next = new Date(staggered);
  for (let i = 1; i <= 48; i++) {
    next.setUTCHours(next.getUTCHours() + 1);
    next.setUTCMinutes(0);

    const nextBrtHour = (next.getUTCHours() - 3 + 24) % 24;
    const nextBrtDay = next.getUTCDay();

    for (const window of page.schedule.windows) {
      const dayMatch = !window.days || window.days.length === 0 || window.days.includes(nextBrtDay);
      if (!dayMatch) continue;

      const inWindow = window.startHour <= window.endHour
        ? nextBrtHour >= window.startHour && nextBrtHour < window.endHour
        : nextBrtHour >= window.startHour || nextBrtHour < window.endHour;

      if (inWindow) return next;
    }
  }

  // Fallback: schedule in 30 minutes
  return new Date(staggered.getTime() + 30 * 60_000);
}

/**
 * Summary stats for logging
 */
export function getPagesSummary(): { total: number; enabled: number; totalFollowers: number; igAccounts: number } {
  const enabled = getEnabledPages();
  return {
    total: PAGES.length,
    enabled: enabled.length,
    totalFollowers: enabled.reduce((sum, p) => sum + p.followers + (p.instagram?.followers || 0), 0),
    igAccounts: enabled.filter(p => p.instagram).length,
  };
}
