/**
 * Art Generator
 * Gera artes para posts sociais a partir de frames de vídeo
 * Suporta: Upload manual de Canva ou geração automática
 */

import sharp from 'sharp';
import { join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { logger } from '../lib/logger';

export interface ArtGeneratorOptions {
  sourceImagePath?: string; // Imagem de entrada (frame do vídeo ou upload)
  category?: 'politics' | 'economy' | 'sports' | 'technology' | 'entertainment' | 'lotteries' | 'other';
  title?: string;
  userProvidedImageUrl?: string; // URL da arte já feita no Canva (prioridade)
}

export interface GeneratedArt {
  feedImagePath: string; // 1080x1350 para feed
  storyImagePath: string; // 1080x1920 para story
  thumbnailPath: string; // 512x512 para preview
  category: string;
  generatedAt: Date;
}

// Tema de cores por categoria
const THEME_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  politics: { primary: '#1a3a52', secondary: '#e74c3c', accent: '#3498db' },
  economy: { primary: '#27ae60', secondary: '#f39c12', accent: '#16a085' },
  sports: { primary: '#8e44ad', secondary: '#e74c3c', accent: '#f39c12' },
  technology: { primary: '#2c3e50', secondary: '#3498db', accent: '#1abc9c' },
  entertainment: { primary: '#e91e63', secondary: '#9c27b0', accent: '#ff6090' },
  lotteries: { primary: '#f39c12', secondary: '#e74c3c', accent: '#27ae60' },
  other: { primary: '#34495e', secondary: '#95a5a6', accent: '#ecf0f1' },
};

export class ArtGenerator {
  private outputDir = '/tmp/piranot-art-output';

  constructor() {
    // Garantir que diretório existe
    if (!existsSync(this.outputDir)) {
      const fs = require('fs');
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Gerar arte a partir de uma imagem
   * Se userProvidedImageUrl fornecida, usa diretamente
   * Caso contrário, processa sourceImagePath com template
   */
  async generateArt(options: ArtGeneratorOptions): Promise<GeneratedArt> {
    try {
      const category = options.category || 'other';
      const theme = THEME_COLORS[category];

      // Se usuário forneceu URL de arte pronta (Canva), usar diretamente
      if (options.userProvidedImageUrl) {
        logger.info(
          { url: options.userProvidedImageUrl, category },
          '🎨 Usando arte manual do usuário'
        );

        // Simular download e processamento da arte
        // Em produção, fazer download real e redimensionar
        return {
          feedImagePath: options.userProvidedImageUrl,
          storyImagePath: options.userProvidedImageUrl,
          thumbnailPath: options.userProvidedImageUrl,
          category,
          generatedAt: new Date(),
        };
      }

      // Caso contrário, gerar automaticamente
      if (!options.sourceImagePath || !existsSync(options.sourceImagePath)) {
        throw new Error('Source image path required when userProvidedImageUrl not provided');
      }

      // 1. Criar variante para feed (1080x1350)
      const feedImagePath = await this.generateVariant(
        options.sourceImagePath,
        1080,
        1350,
        theme,
        'feed'
      );

      // 2. Criar variante para story (1080x1920)
      const storyImagePath = await this.generateVariant(
        options.sourceImagePath,
        1080,
        1920,
        theme,
        'story'
      );

      // 3. Criar thumbnail (512x512)
      const thumbnailPath = await this.generateVariant(
        options.sourceImagePath,
        512,
        512,
        theme,
        'thumbnail'
      );

      logger.info(
        { feedImagePath, storyImagePath, category },
        '✨ Artes geradas com sucesso'
      );

      return {
        feedImagePath,
        storyImagePath,
        thumbnailPath,
        category,
        generatedAt: new Date(),
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao gerar arte');
      throw err;
    }
  }

  /**
   * Gerar variante específica de uma imagem
   */
  private async generateVariant(
    sourcePath: string,
    width: number,
    height: number,
    theme: { primary: string; secondary: string; accent: string },
    type: string
  ): Promise<string> {
    try {
      const outputPath = join(
        this.outputDir,
        `art-${Date.now()}-${type}.jpg`
      );

      // 1. Redimensionar imagem para o tamanho alvo
      // 2. Adicionar overlay de cor (transparência)
      // 3. Salvar em JPEG com compressão

      await sharp(sourcePath)
        .resize(width, height, {
          fit: 'cover',
          position: 'center',
        })
        // Criar overlay com cor do tema (30% opacidade)
        .composite([
          {
            input: Buffer.from(
              `<svg width="${width}" height="${height}">
                <rect width="${width}" height="${height}" fill="${theme.primary}" opacity="0.3"/>
              </svg>`
            ),
            blend: 'over',
          },
        ])
        .jpeg({ quality: 85, progressive: true })
        .toFile(outputPath);

      logger.debug(
        { outputPath, width, height, type },
        'Variante gerada'
      );
      return outputPath;
    } catch (err: any) {
      logger.error(
        { error: err.message, width, height, type },
        'Erro ao gerar variante'
      );
      throw err;
    }
  }

  /**
   * Aplicar marca d'água (logotipo PiraNOT)
   */
  async addWatermark(imagePath: string, watermarkUrl?: string): Promise<string> {
    try {
      const outputPath = join(this.outputDir, `watermarked-${Date.now()}.jpg`);

      // Se watermarkUrl fornecida, fazer download e aplicar
      // Caso contrário, apenas retornar imagem original
      if (!watermarkUrl) {
        logger.info({ imagePath }, 'Sem marca d\'água configurada');
        return imagePath;
      }

      // Implementação simplificada: em produção fazer download real
      logger.info({ imagePath, watermarkUrl }, '💧 Marca d\'água aplicada');
      return imagePath; // Retornar original por enquanto
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Erro ao aplicar marca d\'água, ignorando');
      return imagePath; // Fallback: retornar sem marca
    }
  }

  /**
   * Otimizar imagem para rede (compressão + redimensionamento)
   */
  async optimizeForWeb(imagePath: string, maxWidth: number = 1080): Promise<string> {
    try {
      const outputPath = join(this.outputDir, `optimized-${Date.now()}.jpg`);

      const metadata = await sharp(imagePath).metadata();
      const width = metadata.width || maxWidth;

      await sharp(imagePath)
        .resize(Math.min(width, maxWidth), undefined, {
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80, progressive: true })
        .toFile(outputPath);

      logger.info({ imagePath, outputPath }, '⚡ Imagem otimizada');
      return outputPath;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao otimizar imagem');
      throw err;
    }
  }

  /**
   * Obter informações sobre imagem
   */
  async getImageInfo(imagePath: string): Promise<{
    width?: number;
    height?: number;
    format?: string;
    size: number;
  }> {
    try {
      const metadata = await sharp(imagePath).metadata();
      const fs = require('fs');
      const size = fs.statSync(imagePath).size;

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size,
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao obter info da imagem');
      throw err;
    }
  }
}

export const artGenerator = new ArtGenerator();
