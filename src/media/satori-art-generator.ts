/**
 * Satori Art Generator v4 — Instagram Arte Automática (Layer Composition)
 *
 * Replica o estilo visual das artes PiraNOT do Canva usando uma abordagem de
 * composição em camadas com Sharp, baseada em medições pixel-a-pixel das artes
 * originais do Canva.
 *
 * Pipeline v4:
 *   Layer 1: Foto de fundo (Sharp resize/crop para 1080×1350)
 *   Layer 2: Gradiente escuro sutil (SVG, começa em ~44%, pesado em ~84%)
 *   Layer 3: Título com caixa colorida semi-transparente (Satori → PNG, posição Y≈850)
 *   Layer 4: Barra "LEIA EM" (Satori → PNG, posição Y≈1075)
 *   Layer 5: Rodapé extraído do Canva (PNG composite direto, posição Y=1140)
 *
 * Medições de referência (1080×1350 do Canva):
 *   | Elemento              | Y Start | Y End | Altura |
 *   |-----------------------|---------|-------|--------|
 *   | Foto pura             | 0       | ~600  | ~600px |
 *   | Gradiente fading      | ~600    | ~850  | ~250px |
 *   | Caixa de título       | ~850    | ~1060 | ~210px |
 *   | Gap                   | ~1060   | ~1075 | ~15px  |
 *   | Barra LEIA EM         | ~1075   | ~1130 | ~55px  |
 *   | Gap                   | ~1130   | ~1140 | ~10px  |
 *   | Rodapé escuro (logos) | ~1140   | ~1350 | ~210px |
 *
 * Dimensões:
 *   Feed: 1080×1350
 *   Story: 1080×1920
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { logger } from '../lib/logger';

// ─── ESM __dirname equivalent ───────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Assets paths ───────────────────────────────────────────────────────────
const ASSETS_DIR = join(__dirname, '..', '..', 'assets');
const OSWALD_BOLD_PATH = join(ASSETS_DIR, 'Oswald-Bold.ttf');
const DEJAVU_BOLD_PATH = join(ASSETS_DIR, 'DejaVuSans-Bold.ttf');
const DEJAVU_REGULAR_PATH = join(ASSETS_DIR, 'DejaVuSans.ttf');

// Extracted Canva footer strips (1080×210 each)
const FOOTER_BLUE_PATH = join(ASSETS_DIR, 'footer-canva.png');
const FOOTER_RED_PATH = join(ASSETS_DIR, 'footer-canva-05.png');

// Extracted Canva LEIA EM bar (1080×65)
const LEIA_EM_PATH = join(ASSETS_DIR, 'leia-em-canva.png');

// ─── Output directory ───────────────────────────────────────────────────────
const OUTPUT_DIR = '/tmp/piranot-artes';

// ─── Layout constants (from Canva measurements at 1080×1350) ────────────────
const LAYOUT = {
  width: 1080,
  feedHeight: 1350,
  storyHeight: 1920,

  // Gradient overlay
  gradientStartPct: 0.44,    // Gradient starts fading in at 44% from top (~Y=594)
  gradientHeavyPct: 0.80,    // Heavy dark from 80% down (~Y=1080)

  // Title box — positioned at ~63% from top
  titleTopY: 850,             // Where the title box starts
  titleBoxMaxHeight: 220,     // Max height for title area
  titleBoxPaddingH: 32,       // Horizontal padding from edges
  titleBoxPaddingV: 22,       // Vertical padding inside box
  titleBoxInnerPadH: 28,      // Inner horizontal padding for text
  titleBoxBorderRadius: 10,

  // LEIA EM bar
  leiaEmTopY: 1075,           // Where LEIA EM bar sits
  leiaEmHeight: 65,           // Matches extracted asset height

  // Footer
  footerTopY: 1140,           // Footer begins
  footerHeight: 210,          // Matches extracted asset height (1350 - 1140 = 210)
} as const;

// ─── Category colors (from visual audit of real artes) ──────────────────────
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

// Categories that use the red footer instead of blue
const RED_FOOTER_CATEGORIES = new Set(['police', 'policial']);

// ─── Fonts & assets (loaded once) ──────────────────────────────────────────
let fontsLoaded = false;
let oswaldBoldData: ArrayBuffer;
let dejavuBoldData: ArrayBuffer;
let dejavuRegularData: ArrayBuffer;
let footerBlueBuffer: Buffer | null = null;
let footerRedBuffer: Buffer | null = null;
let leiaEmBuffer: Buffer | null = null;

function loadAssets(): void {
  if (fontsLoaded) return;

  // Load fonts
  if (existsSync(OSWALD_BOLD_PATH)) {
    oswaldBoldData = readFileSync(OSWALD_BOLD_PATH).buffer as ArrayBuffer;
  } else {
    logger.warn('Oswald-Bold.ttf not found, falling back to DejaVuSans-Bold');
    oswaldBoldData = readFileSync(DEJAVU_BOLD_PATH).buffer as ArrayBuffer;
  }
  dejavuBoldData = readFileSync(DEJAVU_BOLD_PATH).buffer as ArrayBuffer;
  dejavuRegularData = readFileSync(DEJAVU_REGULAR_PATH).buffer as ArrayBuffer;

  // Load extracted Canva footer strips
  if (existsSync(FOOTER_BLUE_PATH)) {
    footerBlueBuffer = readFileSync(FOOTER_BLUE_PATH);
    logger.info('Canva footer (blue) loaded');
  } else {
    logger.warn('footer-canva.png not found — footer will be generated');
  }
  if (existsSync(FOOTER_RED_PATH)) {
    footerRedBuffer = readFileSync(FOOTER_RED_PATH);
    logger.info('Canva footer (red) loaded');
  }

  // Load extracted LEIA EM bar
  if (existsSync(LEIA_EM_PATH)) {
    leiaEmBuffer = readFileSync(LEIA_EM_PATH);
    logger.info('Canva LEIA EM bar loaded');
  } else {
    logger.warn('leia-em-canva.png not found — LEIA EM will be generated');
  }

  fontsLoaded = true;
  logger.info('v4 arte generator: all assets loaded');
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ArteOptions {
  /** Article title — displayed as the headline on the arte */
  title: string;
  /** Article category — determines the color of the title bar and footer variant */
  category: string;
  /** URL of the source image (featured image from WP or RSS) */
  imageUrl?: string;
  /** Article URL for the "LEIA EM" bar */
  articleUrl?: string;
  /** Format: 'feed' (1080×1350) or 'story' (1080×1920) */
  format?: 'feed' | 'story';
}

export interface ArteResult {
  /** Path to the generated PNG file on disk */
  filePath: string;
  /** Width of the generated image */
  width: number;
  /** Height of the generated image */
  height: number;
  /** How the background was sourced */
  backgroundSource: 'download' | 'placeholder';
  /** Time to generate in ms */
  generationTimeMs: number;
}

// ─── Main generator class ───────────────────────────────────────────────────
export class SatoriArtGenerator {
  constructor() {
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    loadAssets();
  }

  /**
   * Generate an Instagram arte for the given article (v4 layer pipeline).
   *
   * Pipeline:
   *   1. Download source image (or placeholder gradient)
   *   2. Resize/crop to 1080×1350 with Sharp (smart crop "attention")
   *   3. Apply subtle dark gradient (SVG overlay via Sharp composite)
   *   4. Render title box with Satori → Resvg → PNG (positioned at Y≈850)
   *   5. Composite title PNG at correct Y position
   *   6. Composite LEIA EM bar (extracted PNG or generated) at Y≈1075
   *   7. Composite extracted Canva footer PNG at Y=1140
   *   8. Export final PNG
   */
  async generate(options: ArteOptions): Promise<ArteResult> {
    const start = Date.now();
    const format = options.format || 'feed';
    const width = LAYOUT.width;
    const height = format === 'feed' ? LAYOUT.feedHeight : LAYOUT.storyHeight;
    const category = this.normalizeCategory(options.category);
    const titleColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
    const isRedCategory = RED_FOOTER_CATEGORIES.has(category);

    logger.info(
      { title: options.title.substring(0, 60), category, format, titleColor, isRedCategory },
      'v4: Generating Instagram arte (layer pipeline)'
    );

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 1: Background photo
      // ═══════════════════════════════════════════════════════════════════════
      let bgBuffer: Buffer;
      let bgSource: 'download' | 'placeholder' = 'placeholder';

      if (options.imageUrl) {
        try {
          bgBuffer = await this.downloadImage(options.imageUrl);
          bgSource = 'download';
        } catch (dlErr: any) {
          logger.warn({ url: options.imageUrl, error: dlErr.message }, 'Image download failed, using placeholder');
          bgBuffer = await this.createPlaceholderBackground(width, height, titleColor);
        }
      } else {
        bgBuffer = await this.createPlaceholderBackground(width, height, titleColor);
      }

      // Resize and crop to exact dimensions (smart crop focuses on faces/subjects)
      const resizedBg = await sharp(bgBuffer)
        .resize(width, height, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 92 })
        .toBuffer();

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 2: Subtle dark gradient overlay
      // ═══════════════════════════════════════════════════════════════════════
      const gradientSvg = this.createGradientSvg(width, height);
      const bgWithGradient = await sharp(resizedBg)
        .composite([{
          input: Buffer.from(gradientSvg),
          blend: 'over',
        }])
        .png()
        .toBuffer();

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 3: Title box (Satori → Resvg → PNG)
      // ═══════════════════════════════════════════════════════════════════════
      const titleText = options.title.toUpperCase();
      const titlePng = await this.renderTitleBox(
        width, height, titleText, titleColor
      );

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 4: LEIA EM bar
      // ═══════════════════════════════════════════════════════════════════════
      let leiaEmPng: Buffer;
      if (leiaEmBuffer) {
        // Use the extracted Canva LEIA EM bar directly
        leiaEmPng = await sharp(leiaEmBuffer)
          .resize(width, LAYOUT.leiaEmHeight, { fit: 'fill' })
          .png()
          .toBuffer();
      } else {
        // Fallback: render with Satori
        leiaEmPng = await this.renderLeiaEmBar(width, titleColor);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 5: Footer (extracted Canva PNG)
      // ═══════════════════════════════════════════════════════════════════════
      let footerPng: Buffer;
      const footerSource = isRedCategory ? footerRedBuffer : footerBlueBuffer;

      if (footerSource) {
        // Use extracted Canva footer directly — already 1080×210
        footerPng = await sharp(footerSource)
          .resize(width, LAYOUT.footerHeight, { fit: 'fill' })
          .ensureAlpha()
          .png()
          .toBuffer();
      } else {
        // Fallback: render a basic footer with Satori
        footerPng = await this.renderFooterFallback(width, titleColor);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // COMPOSITE: Stack all layers
      // ═══════════════════════════════════════════════════════════════════════
      const composites: sharp.OverlayOptions[] = [
        // Title overlay (full-size transparent PNG, title positioned internally)
        {
          input: titlePng,
          top: 0,
          left: 0,
          blend: 'over',
        },
        // LEIA EM bar
        {
          input: leiaEmPng,
          top: LAYOUT.leiaEmTopY,
          left: 0,
          blend: 'over',
        },
        // Footer strip
        {
          input: footerPng,
          top: LAYOUT.footerTopY,
          left: 0,
          blend: 'over',
        },
      ];

      const finalImage = await sharp(bgWithGradient)
        .composite(composites)
        .png({ compressionLevel: 6 })
        .toBuffer();

      // ═══════════════════════════════════════════════════════════════════════
      // SAVE
      // ═══════════════════════════════════════════════════════════════════════
      const filename = `arte-${Date.now()}-${format}.png`;
      const filePath = join(OUTPUT_DIR, filename);
      await writeFile(filePath, finalImage);

      const generationTimeMs = Date.now() - start;
      logger.info(
        { filePath, width, height, category, generationTimeMs, bgSource },
        'v4: Instagram arte generated successfully'
      );

      return { filePath, width, height, backgroundSource: bgSource, generationTimeMs };
    } catch (err: any) {
      logger.error({ error: err.message, stack: err.stack, title: options.title.substring(0, 60) }, 'v4: Failed to generate arte');
      throw err;
    }
  }

  // ─── Layer renderers ────────────────────────────────────────────────────

  /**
   * Create the dark gradient SVG overlay.
   *
   * v4 gradient is SUBTLER than v3 — the photo should be the protagonist.
   * Matches Canva: transparent top → gentle fade starting at ~44% → heavy dark at ~84%
   * The area below 84% will be covered by LEIA EM and footer anyway.
   */
  private createGradientSvg(width: number, height: number): string {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="40%" stop-color="black" stop-opacity="0"/>
          <stop offset="55%" stop-color="black" stop-opacity="0.12"/>
          <stop offset="63%" stop-color="black" stop-opacity="0.35"/>
          <stop offset="75%" stop-color="black" stop-opacity="0.65"/>
          <stop offset="84%" stop-color="black" stop-opacity="0.88"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)"/>
    </svg>`;
  }

  /**
   * Render the title box as a full-size transparent PNG.
   *
   * The title is positioned at Y≈850 (63% from top), matching the Canva layout.
   * Uses Satori to render the title text with category-colored semi-transparent
   * background box and thick black text stroke.
   */
  private async renderTitleBox(
    width: number,
    height: number,
    title: string,
    titleColor: string,
  ): Promise<Buffer> {
    const fontSize = this.calculateFontSize(title, width);
    const titleBgColor = hexToRgba(titleColor, 0.82);

    // Crisp text stroke: 16-point shadow for thick black outline on white text
    // More points = crisper outline (vs v3's 12 points which were fuzzy)
    const textStroke = [
      // 3px cardinal directions
      '0 -3px 0 #000', '0 3px 0 #000', '-3px 0 0 #000', '3px 0 0 #000',
      // 3px diagonals
      '-3px -3px 0 #000', '3px -3px 0 #000', '-3px 3px 0 #000', '3px 3px 0 #000',
      // 2px cardinal
      '0 -2px 0 #000', '0 2px 0 #000', '-2px 0 0 #000', '2px 0 0 #000',
      // 2px diagonals
      '-2px -2px 0 #000', '2px -2px 0 #000', '-2px 2px 0 #000', '2px 2px 0 #000',
    ].join(', ');

    // The element tree positions the title box at the correct Y position
    // by using a spacer div that pushes content down
    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: `${width}px`,
          height: `${height}px`,
        },
        children: [
          // Spacer to push title down to Y≈850 (63% of 1350)
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexGrow: 1,
                minHeight: `${LAYOUT.titleTopY}px`,
              },
              children: [],
            },
          },
          // Title box with colored semi-transparent background
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                padding: `0 ${LAYOUT.titleBoxPaddingH}px`,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      backgroundColor: titleBgColor,
                      padding: `${LAYOUT.titleBoxPaddingV}px ${LAYOUT.titleBoxInnerPadH}px`,
                      borderRadius: `${LAYOUT.titleBoxBorderRadius}px`,
                    },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: {
                            color: 'white',
                            fontSize: `${fontSize}px`,
                            fontFamily: 'Oswald',
                            fontWeight: 700,
                            lineHeight: 1.15,
                            textTransform: 'uppercase' as any,
                            letterSpacing: '0.5px',
                            textShadow: textStroke,
                          },
                          children: title,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          // Remaining space below title (will be covered by LEIA EM + footer composites)
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexGrow: 1 },
              children: [],
            },
          },
        ],
      },
    };

    const svg = await satori(element as any, {
      width,
      height,
      fonts: this.getSatoriFonts(),
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
    return Buffer.from(resvg.render().asPng());
  }

  /**
   * Render the LEIA EM bar as a standalone strip (fallback when extracted asset missing).
   * Dimensions: 1080×65
   */
  private async renderLeiaEmBar(
    width: number,
    accentColor: string,
  ): Promise<Buffer> {
    const barHeight = LAYOUT.leiaEmHeight;
    const siteUrl = 'WWW.PIRANOT.COM';

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          width: `${width}px`,
          height: `${barHeight}px`,
          padding: '0 38px',
          gap: '10px',
          backgroundColor: 'rgba(0,0,0,0.75)',
        },
        children: [
          // Chain link icon — small colored circle
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: accentColor,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: {
                      color: 'white',
                      fontSize: '16px',
                      fontFamily: 'DejaVu Sans',
                      fontWeight: 700,
                    },
                    children: '@',
                  },
                },
              ],
            },
          },
          {
            type: 'span',
            props: {
              style: {
                color: 'white',
                fontSize: '22px',
                fontFamily: 'DejaVu Sans',
                fontWeight: 700,
                letterSpacing: '1.5px',
                textShadow: '1px 2px 4px rgba(0,0,0,0.8)',
              },
              children: `LEIA EM:   ${siteUrl}`,
            },
          },
        ],
      },
    };

    const svg = await satori(element as any, {
      width,
      height: barHeight,
      fonts: this.getSatoriFonts(),
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
    return Buffer.from(resvg.render().asPng());
  }

  /**
   * Render a basic footer bar as fallback (when extracted Canva PNGs are missing).
   * Dimensions: 1080×210
   */
  private async renderFooterFallback(
    width: number,
    accentColor: string,
  ): Promise<Buffer> {
    const footerHeight = LAYOUT.footerHeight;

    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${width}px`,
          height: `${footerHeight}px`,
          backgroundColor: 'rgba(0,0,0,0.95)',
          gap: '48px',
          padding: '0 40px',
        },
        children: [
          // PIRANOT JORNAL
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '12px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      width: '46px',
                      height: '46px',
                      borderRadius: '6px',
                      border: '2.5px solid white',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: {
                            color: 'white',
                            fontSize: '22px',
                            fontFamily: 'DejaVu Sans',
                            fontWeight: 700,
                          },
                          children: 'JC',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1px',
                    },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: {
                            color: 'white',
                            fontSize: '32px',
                            fontFamily: 'Oswald',
                            fontWeight: 700,
                            letterSpacing: '3px',
                            lineHeight: 1,
                          },
                          children: 'PIRANOT',
                        },
                      },
                      {
                        type: 'span',
                        props: {
                          style: {
                            color: '#cc0000',
                            fontSize: '12px',
                            fontFamily: 'DejaVu Sans',
                            fontWeight: 700,
                            letterSpacing: '5px',
                            lineHeight: 1,
                          },
                          children: 'JORNAL',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          // EJUCA
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '10px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      border: '2.5px solid white',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: {
                            color: 'white',
                            fontSize: '20px',
                            fontFamily: 'DejaVu Sans',
                            fontWeight: 700,
                          },
                          children: 'S',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      color: 'white',
                      fontSize: '32px',
                      fontFamily: 'Oswald',
                      fontWeight: 700,
                      letterSpacing: '3px',
                    },
                    children: 'EJUCA',
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const svg = await satori(element as any, {
      width,
      height: footerHeight,
      fonts: this.getSatoriFonts(),
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
    return Buffer.from(resvg.render().asPng());
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get Satori font configuration (reusable across all renderers).
   */
  private getSatoriFonts() {
    return [
      { name: 'Oswald', data: oswaldBoldData, weight: 700 as const, style: 'normal' as const },
      { name: 'DejaVu Sans', data: dejavuBoldData, weight: 700 as const, style: 'normal' as const },
      { name: 'DejaVu Sans', data: dejavuRegularData, weight: 400 as const, style: 'normal' as const },
    ];
  }

  /**
   * Calculate optimal font size based on title length.
   * v4: Tuned for title box at Y≈850 with ~210px available height.
   * At 1080px with 28+32px padding, Oswald Bold fits ~18-20 uppercase chars/line at 64px.
   * Target: 2-4 lines max.
   */
  private calculateFontSize(title: string, _canvasWidth: number): number {
    const len = title.length;
    if (len <= 30) return 62;       // Very short: 1-2 lines, max impact
    if (len <= 50) return 56;       // Short: 2-3 lines
    if (len <= 75) return 50;       // Medium: 3-4 lines
    if (len <= 100) return 44;      // Long: 3-4 lines
    if (len <= 140) return 40;      // Very long: 4-5 lines
    return 36;                       // Extra long
  }

  /**
   * Download image from URL with timeout and validation.
   */
  private async downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'PiraNOT-ArtGenerator/4.0' },
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status} downloading image`);
    }

    const buffer = Buffer.from(response.data);
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Downloaded file is not a valid image');
    }

    logger.debug(
      { url: url.substring(0, 80), width: metadata.width, height: metadata.height, format: metadata.format },
      'Image downloaded for arte'
    );

    return buffer;
  }

  /**
   * Create placeholder gradient background when no source image is available.
   */
  private async createPlaceholderBackground(
    width: number,
    height: number,
    accentColor: string,
  ): Promise<Buffer> {
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1a1a2e"/>
          <stop offset="50%" stop-color="${accentColor}"/>
          <stop offset="100%" stop-color="#16213e"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
    </svg>`;

    return sharp(Buffer.from(svg))
      .resize(width, height)
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  /**
   * Normalize category string to match our color map.
   */
  private normalizeCategory(category: string): string {
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

  // ─── Publishing ─────────────────────────────────────────────────────────

  /**
   * Copy arte to WP uploads so it's accessible via public URL.
   * Returns: https://piranot.com.br/wp-content/uploads/artes/{filename}
   */
  async publishToWeb(localPath: string): Promise<string> {
    const fs = await import('fs/promises');
    const { basename } = await import('path');

    const WP_UPLOADS_ARTES = '/opt/web/piranot/volumes/wp_data/wp-content/uploads/artes';
    const filename = basename(localPath);
    const destPath = join(WP_UPLOADS_ARTES, filename);

    try {
      await fs.copyFile(localPath, destPath);
      await fs.chmod(destPath, 0o644);

      const publicUrl = `https://piranot.com.br/wp-content/uploads/artes/${filename}`;
      logger.info({ localPath, publicUrl }, 'Arte published to web');
      return publicUrl;
    } catch (err: any) {
      logger.error({ localPath, destPath, error: err.message }, 'Failed to publish arte to web');
      throw err;
    }
  }

  /**
   * Generate arte AND publish to web — convenience method for workers.
   * Returns the public URL ready for Instagram API.
   */
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

  /**
   * Clean up old arte files (older than maxAgeMs, default 24h).
   */
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
      } catch {
        // Ignore
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up old arte files');
    }
    return cleaned;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
export const satoriArtGenerator = new SatoriArtGenerator();
