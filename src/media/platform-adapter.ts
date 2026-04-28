/**
 * Platform Adapter
 * Redimensiona e adapta imagens para cada plataforma social
 * Cada plataforma tem requisitos específicos de dimensão, formato, tamanho de arquivo
 */

import sharp from 'sharp';
import { join } from 'path';
import { logger } from '../lib/logger';
import { SocialChannel } from '../types';

export interface PlatformSpecs {
  name: string;
  channel: SocialChannel;
  contentTypes: string[];
  imageFormats: ('jpeg' | 'png' | 'webp')[];
  dimensions: {
    feed?: { width: number; height: number };
    story?: { width: number; height: number };
    reel?: { width: number; height: number };
    carousel?: { width: number; height: number };
  };
  maxFileSize: number; // em bytes
  quality: number; // 1-100
  recommendations: string[];
}

export const PLATFORM_SPECS: Record<SocialChannel, PlatformSpecs> = {
  facebook: {
    name: 'Facebook',
    channel: 'facebook',
    contentTypes: ['feed', 'link'],
    imageFormats: ['jpeg', 'png', 'webp'],
    dimensions: {
      feed: { width: 1200, height: 628 }, // Link preview
      carousel: { width: 1200, height: 628 },
    },
    maxFileSize: 8 * 1024 * 1024, // 8MB
    quality: 85,
    recommendations: [
      'Use 16:9 aspect ratio for best display',
      'Include text overlay for link previews',
      'Avoid small text, may be cut off on mobile',
    ],
  },
  instagram: {
    name: 'Instagram',
    channel: 'instagram',
    contentTypes: ['feed', 'story', 'reel'],
    imageFormats: ['jpeg', 'webp'],
    dimensions: {
      feed: { width: 1080, height: 1350 }, // 4:5 aspect ratio
      story: { width: 1080, height: 1920 }, // 9:16 aspect ratio
      reel: { width: 1080, height: 1920 }, // 9:16 aspect ratio
      carousel: { width: 1080, height: 1350 },
    },
    maxFileSize: 8 * 1024 * 1024, // 8MB
    quality: 90,
    recommendations: [
      'Stories expire in 24 hours',
      'Reels support up to 90 seconds',
      'Use safe zone: avoid 250px from edges',
      'Portrait orientation recommended',
    ],
  },
  tiktok: {
    name: 'TikTok',
    channel: 'tiktok',
    contentTypes: ['reel', 'story'],
    imageFormats: ['jpeg', 'webp'],
    dimensions: {
      reel: { width: 1080, height: 1920 }, // 9:16 aspect ratio
      story: { width: 1080, height: 1920 },
    },
    maxFileSize: 287.6 * 1024 * 1024, // 287.6MB for video, smaller for images
    quality: 85,
    recommendations: [
      'Vertical video 9:16 required',
      'First 3 seconds are critical',
      'Trending sounds boost reach',
      'Captions recommended for engagement',
    ],
  },
  twitter: {
    name: 'Twitter/X',
    channel: 'twitter',
    contentTypes: ['feed', 'link'],
    imageFormats: ['jpeg', 'png', 'webp'],
    dimensions: {
      feed: { width: 1200, height: 675 }, // 16:9 aspect ratio
    },
    maxFileSize: 15 * 1024 * 1024, // 15MB
    quality: 85,
    recommendations: [
      'Square images (1:1) also work well',
      'Keep important content in center (crops on mobile)',
      'High contrast for readability',
      'Text may be hard to read on mobile',
    ],
  },
  linkedin: {
    name: 'LinkedIn',
    channel: 'linkedin',
    contentTypes: ['feed', 'link'],
    imageFormats: ['jpeg', 'png', 'webp'],
    dimensions: {
      feed: { width: 1200, height: 628 }, // 16:9 aspect ratio
    },
    maxFileSize: 10 * 1024 * 1024, // 10MB
    quality: 85,
    recommendations: [
      'Professional tone recommended',
      'Person in image increases engagement',
      'Text overlay should be minimal',
      'Use company branding',
    ],
  },
  whatsapp: {
    name: 'WhatsApp',
    channel: 'whatsapp',
    contentTypes: ['link'],
    imageFormats: ['jpeg', 'png'],
    dimensions: {
      feed: { width: 800, height: 418 }, // Thumbnail size
    },
    maxFileSize: 16 * 1024 * 1024, // 16MB
    quality: 75,
    recommendations: [
      'Keep file size small for fast loading',
      'Use simple, clear images',
      'Text should be readable on small screens',
    ],
  },
};

export class PlatformAdapter {
  private outputDir = '/tmp/piranot-platform-adapted';

  constructor() {
    const fs = require('fs');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Adaptar imagem para plataforma específica
   */
  async adaptForPlatform(
    imagePath: string,
    platform: SocialChannel,
    contentType: string = 'feed'
  ): Promise<string> {
    try {
      const specs = PLATFORM_SPECS[platform];
      if (!specs) {
        throw new Error(`Unknown platform: ${platform}`);
      }

      // Obter dimensões para este tipo de conteúdo
      const dims = specs.dimensions[contentType as keyof typeof specs.dimensions];
      if (!dims) {
        throw new Error(`${platform} doesn't support ${contentType} content`);
      }

      const outputPath = join(
        this.outputDir,
        `${platform}-${contentType}-${Date.now()}.jpg`
      );

      // Redimensionar e otimizar para plataforma
      await sharp(imagePath)
        .resize(dims.width, dims.height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: specs.quality, progressive: true })
        .toFile(outputPath);

      logger.info(
        { platform, contentType, dimensions: dims, outputPath },
        '📱 Imagem adaptada para plataforma'
      );

      return outputPath;
    } catch (err: any) {
      logger.error(
        { error: err.message, platform, contentType },
        'Erro ao adaptar para plataforma'
      );
      throw err;
    }
  }

  /**
   * Adaptar para múltiplas plataformas
   */
  async adaptForAllPlatforms(
    imagePath: string,
    platforms: SocialChannel[]
  ): Promise<Record<SocialChannel, string>> {
    try {
      const results: Record<SocialChannel, string> = {} as Record<SocialChannel, string>;

      for (const platform of platforms) {
        const specs = PLATFORM_SPECS[platform];

        // Determinar tipo de conteúdo baseado na plataforma
        let contentType = 'feed';
        if (platform === 'instagram' && specs.dimensions.story) {
          contentType = 'story'; // Stories LIFO
        } else if (platform === 'tiktok' && specs.dimensions.reel) {
          contentType = 'reel';
        }

        const adapted = await this.adaptForPlatform(imagePath, platform, contentType);
        results[platform] = adapted;
      }

      logger.info({ platforms: Object.keys(results) }, '🎯 Imagens adaptadas para todas as plataformas');
      return results;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao adaptar para múltiplas plataformas');
      throw err;
    }
  }

  /**
   * Validar imagem contra specs da plataforma
   */
  async validateForPlatform(
    imagePath: string,
    platform: SocialChannel,
    contentType: string = 'feed'
  ): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const specs = PLATFORM_SPECS[platform];
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!specs) {
        errors.push(`Unknown platform: ${platform}`);
        return { isValid: false, errors, warnings };
      }

      // Obter metadata
      const metadata = await sharp(imagePath).metadata();
      const fs = require('fs');
      const fileSize = fs.statSync(imagePath).size;

      // Validações
      if (!metadata.format) {
        errors.push('Could not determine image format');
      } else if (!specs.imageFormats.includes(metadata.format as any)) {
        warnings.push(
          `Recommended formats: ${specs.imageFormats.join(', ')}, got ${metadata.format}`
        );
      }

      if (fileSize > specs.maxFileSize) {
        errors.push(
          `File too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds ${(specs.maxFileSize / 1024 / 1024).toFixed(1)}MB`
        );
      }

      const dims = specs.dimensions[contentType as keyof typeof specs.dimensions];
      if (dims) {
        // Verificar aspect ratio (com tolerância de 5%)
        const actualRatio = (metadata.width || 0) / (metadata.height || 1);
        const expectedRatio = dims.width / dims.height;
        const tolerance = 0.05;

        if (Math.abs(actualRatio - expectedRatio) > tolerance) {
          warnings.push(
            `Aspect ratio ${actualRatio.toFixed(2)} differs from recommended ${expectedRatio.toFixed(2)} for ${platform} ${contentType}`
          );
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (err: any) {
      return {
        isValid: false,
        errors: [err.message],
        warnings: [],
      };
    }
  }

  /**
   * Obter recomendações para plataforma
   */
  getRecommendations(platform: SocialChannel): string[] {
    const specs = PLATFORM_SPECS[platform];
    return specs ? specs.recommendations : [];
  }

  /**
   * Obter specs completo para plataforma
   */
  getSpecs(platform: SocialChannel): PlatformSpecs | null {
    return PLATFORM_SPECS[platform] || null;
  }
}

export const platformAdapter = new PlatformAdapter();
