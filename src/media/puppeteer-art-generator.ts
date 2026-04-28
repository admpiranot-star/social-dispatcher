/**
 * Puppeteer Art Generator v5 — Instagram Arte Automática
 *
 * Replaces Satori v4 with Chrome headless for pixel-perfect rendering.
 * Key advantage: native -webkit-text-stroke, real CSS, @font-face.
 *
 * Pipeline:
 *   1. Download/crop background image via Sharp (attention-based crop)
 *   2. Build HTML with base64-embedded assets
 *   3. Render via Chrome headless → screenshot
 *
 * Layout (1080×1350, measured from Canva originals):
 *   | Element        | Y Start | Y End | Height |
 *   |----------------|---------|-------|--------|
 *   | Photo          | 0       | ~600  | ~600   |
 *   | Gradient fade  | ~600    | ~850  | ~250   |
 *   | Title box      | ~850    | ~1060 | ~210   |
 *   | Gap            | ~1060   | ~1075 | ~15    |
 *   | LEIA EM bar    | ~1075   | ~1130 | ~55    |
 *   | Gap            | ~1130   | ~1140 | ~10    |
 *   | Footer (logos) | ~1140   | ~1350 | ~210   |
 */

import puppeteer, { type Browser } from 'puppeteer-core';
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { logger } from '../lib/logger';

// ─── ESM __dirname ───────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Paths ──────────────────────────────────────────────────────────────────
const ASSETS_DIR = join(__dirname, '..', '..', 'assets');
const OUTPUT_DIR = '/tmp/piranot-artes';
const WP_UPLOADS_ARTES = '/opt/web/piranot/volumes/wp_data/wp-content/uploads/artes';
const CHROME_PATH = '/usr/bin/google-chrome-stable';

// ─── Layout constants ───────────────────────────────────────────────────────
const LAYOUT = {
  width: 1080,
  feedHeight: 1350,
  storyHeight: 1920,
  titleTopY: 850,
  titleBoxPaddingH: 32,
  leiaEmTopY: 1075,
  leiaEmHeight: 65,
  footerTopY: 1140,
  footerHeight: 210,
} as const;

// ─── Category colors ────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  politics:      '#1e50b4',
  economy:       '#1e50b4',
  sports:        '#1e50b4',
  technology:    '#4b0082',
  entertainment: '#c71585',
  lotteries:     '#b8860b',
  police:        '#cc0000',
  policial:      '#cc0000',
  other:         '#1e50b4',
};

const RED_FOOTER_CATEGORIES = new Set(['police', 'policial']);

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ArteOptions {
  title: string;
  category: string;
  imageUrl?: string;
  articleUrl?: string;
  format?: 'feed' | 'story';
}

export interface ArteResult {
  filePath: string;
  width: number;
  height: number;
  backgroundSource: 'download' | 'placeholder';
  generationTimeMs: number;
}

// ─── Cached assets (loaded once) ────────────────────────────────────────────
let assetsLoaded = false;
let oswaldBoldB64 = '';
let leiaEmB64 = '';
let footerBlueB64 = '';
let footerRedB64 = '';

function loadAssets(): void {
  if (assetsLoaded) return;

  const oswaldPath = join(ASSETS_DIR, 'Oswald-Bold.ttf');
  if (existsSync(oswaldPath)) {
    oswaldBoldB64 = readFileSync(oswaldPath).toString('base64');
  } else {
    const fallback = join(ASSETS_DIR, 'DejaVuSans-Bold.ttf');
    oswaldBoldB64 = readFileSync(fallback).toString('base64');
    logger.warn('Oswald-Bold.ttf not found, using DejaVuSans-Bold fallback');
  }

  const leiaPath = join(ASSETS_DIR, 'leia-em-canva.png');
  if (existsSync(leiaPath)) {
    leiaEmB64 = readFileSync(leiaPath).toString('base64');
  }

  const footerBluePath = join(ASSETS_DIR, 'footer-canva.png');
  if (existsSync(footerBluePath)) {
    footerBlueB64 = readFileSync(footerBluePath).toString('base64');
  }

  const footerRedPath = join(ASSETS_DIR, 'footer-canva-05.png');
  if (existsSync(footerRedPath)) {
    footerRedB64 = readFileSync(footerRedPath).toString('base64');
  }

  assetsLoaded = true;
  logger.info('v5 arte generator: assets loaded (Puppeteer)');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeCategory(category: string): string {
  const cat = category.toLowerCase().trim();
  const map: Record<string, string> = {
    'politica': 'politics', 'política': 'politics', 'politics': 'politics',
    'economia': 'economy', 'economy': 'economy',
    'esportes': 'sports', 'esporte': 'sports', 'sports': 'sports',
    'tecnologia': 'technology', 'technology': 'technology',
    'entretenimento': 'entertainment', 'entertainment': 'entertainment',
    'loterias': 'lotteries', 'loteria': 'lotteries', 'lotteries': 'lotteries',
    'policial': 'police', 'police': 'police', 'seguranca': 'police',
    'segurança': 'police', 'crime': 'police',
  };
  return map[cat] || 'other';
}

function calculateFontSize(title: string): number {
  const len = title.length;
  if (len <= 30) return 62;
  if (len <= 50) return 56;
  if (len <= 75) return 50;
  if (len <= 100) return 44;
  if (len <= 140) return 40;
  return 36;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── HTML Template Builder ──────────────────────────────────────────────────

function buildHtml(opts: {
  bgImageB64: string | null;
  titleText: string;
  categoryColor: string;
  fontSize: number;
  width: number;
  height: number;
  isRedCategory: boolean;
}): string {
  const { bgImageB64, titleText, categoryColor, fontSize, width, height, isRedCategory } = opts;

  const bgLayer = bgImageB64
    ? `<img class="bg-photo" src="data:image/jpeg;base64,${bgImageB64}" />`
    : `<div class="bg-placeholder"></div>`;

  const footerB64 = isRedCategory ? footerRedB64 : footerBlueB64;

  // Escape HTML entities in title
  const safeTitle = titleText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@font-face {
  font-family: 'Oswald';
  src: url('data:font/truetype;base64,${oswaldBoldB64}') format('truetype');
  font-weight: 700;
  font-display: block;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: ${width}px;
  height: ${height}px;
  overflow: hidden;
  position: relative;
  background: #000;
}

/* Layer 1: Background photo */
.bg-photo {
  position: absolute; top: 0; left: 0;
  width: ${width}px; height: ${height}px;
  object-fit: cover; object-position: center;
}
.bg-placeholder {
  position: absolute; top: 0; left: 0;
  width: ${width}px; height: ${height}px;
  background: linear-gradient(135deg, #1a1a2e 0%, ${categoryColor} 50%, #16213e 100%);
}

/* Layer 2: Gradient overlay */
.gradient-overlay {
  position: absolute; top: 0; left: 0;
  width: ${width}px; height: ${height}px;
  background: linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0%,
    rgba(0,0,0,0) 40%,
    rgba(0,0,0,0.12) 55%,
    rgba(0,0,0,0.35) 63%,
    rgba(0,0,0,0.65) 75%,
    rgba(0,0,0,0.88) 84%,
    rgba(0,0,0,0.95) 100%
  );
}

/* Layer 3: Title box */
.title-container {
  position: absolute;
  left: ${LAYOUT.titleBoxPaddingH}px;
  right: ${LAYOUT.titleBoxPaddingH}px;
  top: ${LAYOUT.titleTopY}px;
  max-height: 220px;
  overflow: hidden;
}
.title-box {
  background: ${hexToRgba(categoryColor, 0.82)};
  border-radius: 10px;
  padding: 22px 28px;
  display: inline-block;
  width: 100%;
}
.title-text {
  font-family: 'Oswald', sans-serif;
  font-weight: 700;
  font-size: ${fontSize}px;
  color: #ffffff;
  text-transform: uppercase;
  -webkit-text-stroke: 2px rgba(0,0,0,0.7);
  paint-order: stroke fill;
  line-height: 1.15;
  letter-spacing: 0.5px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Layer 4: LEIA EM bar */
.leia-em {
  position: absolute;
  top: ${LAYOUT.leiaEmTopY}px; left: 0;
  width: ${width}px; height: ${LAYOUT.leiaEmHeight}px;
  object-fit: cover;
}

/* Layer 5: Footer */
.footer {
  position: absolute;
  top: ${LAYOUT.footerTopY}px; left: 0;
  width: ${width}px; height: ${LAYOUT.footerHeight}px;
  object-fit: cover;
}
</style></head><body>

${bgLayer}
<div class="gradient-overlay"></div>

<div class="title-container">
  <div class="title-box">
    <span class="title-text">${safeTitle}</span>
  </div>
</div>

${leiaEmB64 ? `<img class="leia-em" src="data:image/png;base64,${leiaEmB64}" />` : ''}
${footerB64 ? `<img class="footer" src="data:image/png;base64,${footerB64}" />` : ''}

</body></html>`;
}

// ─── Main Class ─────────────────────────────────────────────────────────────

export class PuppeteerArtGenerator {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    logger.info('Launching Chrome headless for art generation...');
    this.browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
      ],
    });

    return this.browser;
  }

  async generate(options: ArteOptions): Promise<ArteResult> {
    const startTime = Date.now();
    loadAssets();

    const format = options.format || 'feed';
    const width = LAYOUT.width;
    const height = format === 'feed' ? LAYOUT.feedHeight : LAYOUT.storyHeight;
    const category = normalizeCategory(options.category);
    const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
    const isRedCategory = RED_FOOTER_CATEGORIES.has(category);
    const titleText = options.title.toUpperCase();
    const fontSize = calculateFontSize(options.title);

    // Download and crop background image
    let bgImageB64: string | null = null;
    let backgroundSource: 'download' | 'placeholder' = 'placeholder';

    if (options.imageUrl) {
      try {
        const imgBuffer = await this.downloadImage(options.imageUrl);
        const cropped = await sharp(imgBuffer)
          .resize(width, height, { fit: 'cover', position: 'attention' })
          .jpeg({ quality: 92 })
          .toBuffer();
        bgImageB64 = cropped.toString('base64');
        backgroundSource = 'download';
      } catch (err: any) {
        logger.warn(
          { imageUrl: options.imageUrl, error: err.message },
          'Failed to download image — using placeholder'
        );
      }
    }

    // Build HTML
    const html = buildHtml({
      bgImageB64,
      titleText,
      categoryColor,
      fontSize,
      width,
      height,
      isRedCategory,
    });

    // Render with Chrome
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width, height });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
      await page.evaluate('document.fonts.ready');

      const screenshotBuffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
        omitBackground: false,
      });

      // Save to disk
      mkdirSync(OUTPUT_DIR, { recursive: true });
      const timestamp = Date.now();
      const filename = `arte-${timestamp}-${format}.png`;
      const filePath = join(OUTPUT_DIR, filename);
      await writeFile(filePath, screenshotBuffer);

      const generationTimeMs = Date.now() - startTime;
      logger.info(
        { filePath, width, height, backgroundSource, generationTimeMs, category },
        'v5 arte generated (Puppeteer)'
      );

      return { filePath, width, height, backgroundSource, generationTimeMs };
    } finally {
      await page.close();
    }
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'PiraNOT-ArtGenerator/5.0' },
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status} downloading image`);
    }

    const buffer = Buffer.from(response.data);
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Downloaded file is not a valid image');
    }

    return buffer;
  }

  async publishToWeb(localPath: string): Promise<string> {
    const fs = await import('fs/promises');
    const filename = basename(localPath);
    const destPath = join(WP_UPLOADS_ARTES, filename);

    await fs.copyFile(localPath, destPath);
    await fs.chmod(destPath, 0o644);

    const publicUrl = `https://piranot.com.br/wp-content/uploads/artes/${filename}`;
    logger.info({ localPath, publicUrl }, 'Arte published to web');
    return publicUrl;
  }

  async generateAndPublish(options: ArteOptions): Promise<{
    publicUrl: string;
    filePath: string;
    generationTimeMs: number;
    backgroundSource: 'download' | 'placeholder';
  }> {
    const result = await this.generate(options);
    const publicUrl = await this.publishToWeb(result.filePath);
    return {
      publicUrl,
      filePath: result.filePath,
      generationTimeMs: result.generationTimeMs,
      backgroundSource: result.backgroundSource,
    };
  }

  async cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const fs = await import('fs/promises');
    const files = await fs.readdir(OUTPUT_DIR);
    let cleaned = 0;
    const now = Date.now();

    for (const file of files) {
      if (!file.startsWith('arte-')) continue;
      const filePath = join(OUTPUT_DIR, file);
      try {
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch { /* ignore */ }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up old arte files');
    }
    return cleaned;
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Chrome browser closed');
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
export const artGenerator = new PuppeteerArtGenerator();
