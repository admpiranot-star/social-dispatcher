/**
 * Canva Art Generator Service
 * Gera artes Instagram automaticamente via Canva API
 */

import axios from 'axios';
import { logger } from '../lib/logger';
import { SocialPostPayload } from '../types';

export interface CanvaDesign {
  designId: string;
  imageUrl: string;
  title: string;
  width: number;
  height: number;
}

export interface CanvaApiConfig {
  apiKey: string;
  brandId?: string;
  templateId?: string;
}

export class CanvaGenerator {
  private apiKey: string;
  private apiBaseUrl = 'https://api.canva.com/v1';
  private brandId?: string;

  constructor(config: CanvaApiConfig) {
    this.apiKey = config.apiKey;
    this.brandId = config.brandId;
  }

  /**
   * Gera arte Instagram via Canva API
   * Dimensões padrão: 1080x1350 (Feed), 1080x1920 (Stories)
   */
  async generateInstagramArt(
    payload: SocialPostPayload,
    type: 'feed' | 'story' = 'feed'
  ): Promise<CanvaDesign> {
    const dimensions = type === 'feed' 
      ? { width: 1080, height: 1350 }
      : { width: 1080, height: 1920 };

    try {
      // 1. Criar design a partir de template
      const design = await this.createDesign({
        title: payload.title.substring(0, 50),
        width: dimensions.width,
        height: dimensions.height,
        templateId: this.getTemplateIdByCategory(payload.category),
      });

      // 2. Adicionar texto (título + resumo)
      await this.addText(design.designId, {
        text: payload.title,
        fontSize: type === 'feed' ? 48 : 36,
        position: { x: 40, y: 200 },
      });

      await this.addText(design.designId, {
        text: payload.summary.substring(0, 100),
        fontSize: type === 'feed' ? 32 : 24,
        position: { x: 40, y: 400 },
      });

      // 3. Adicionar imagem (se houver)
      if (payload.imageUrl) {
        await this.addImage(design.designId, {
          imageUrl: payload.imageUrl,
          position: { x: 0, y: 0 },
          width: dimensions.width,
          height: Math.floor(dimensions.height * 0.4),
        });
      }

      // 4. Adicionar watermark PiraNOT
      await this.addText(design.designId, {
        text: 'piranot.com.br',
        fontSize: 20,
        position: { x: 40, y: dimensions.height - 80 },
        opacity: 0.7,
      });

      // 5. Exportar para PNG/JPG
      const imageUrl = await this.exportDesign(design.designId, 'png');

      logger.info(
        { designId: design.designId, type, imageUrl },
        'Instagram art generated via Canva'
      );

      return {
        designId: design.designId,
        imageUrl,
        title: payload.title,
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (err: any) {
      logger.error(
        { error: err.message, payload: payload.id },
        'Failed to generate Instagram art'
      );
      throw err;
    }
  }

  /**
   * Cria novo design baseado em template
   */
  private async createDesign(options: {
    title: string;
    width: number;
    height: number;
    templateId?: string;
  }): Promise<CanvaDesign> {
    const response = await axios.post(
      `${this.apiBaseUrl}/designs`,
      {
        name: options.title,
        baseDesignId: options.templateId || 'DAB1234567890',
        basePageIndex: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    return {
      designId: response.data.designId,
      imageUrl: response.data.thumbnail || '',
      title: options.title,
      width: options.width,
      height: options.height,
    };
  }

  /**
   * Adiciona texto ao design
   */
  private async addText(
    designId: string,
    options: {
      text: string;
      fontSize: number;
      position: { x: number; y: number };
      opacity?: number;
      color?: string;
    }
  ): Promise<void> {
    await axios.patch(
      `${this.apiBaseUrl}/designs/${designId}`,
      {
        updates: [
          {
            type: 'addElement',
            element: {
              type: 'text',
              text: options.text,
              style: {
                fontSize: options.fontSize,
                color: options.color || '#000000',
                opacity: options.opacity || 1,
              },
              position: options.position,
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );
  }

  /**
   * Adiciona imagem ao design
   */
  private async addImage(
    designId: string,
    options: {
      imageUrl: string;
      position: { x: number; y: number };
      width: number;
      height: number;
    }
  ): Promise<void> {
    await axios.patch(
      `${this.apiBaseUrl}/designs/${designId}`,
      {
        updates: [
          {
            type: 'addElement',
            element: {
              type: 'image',
              url: options.imageUrl,
              position: options.position,
              width: options.width,
              height: options.height,
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );
  }

  /**
   * Exporta design como imagem
   */
  private async exportDesign(
    designId: string,
    format: 'png' | 'jpg' | 'pdf' = 'png'
  ): Promise<string> {
    const response = await axios.post(
      `${this.apiBaseUrl}/designs/${designId}/export`,
      {
        format,
        quality: 'high',
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    return response.data.url || response.data.downloadUrl;
  }

  /**
   * Retorna template ID baseado na categoria da notícia
   */
  private getTemplateIdByCategory(category: string): string {
    const templates: Record<string, string> = {
      politics: 'DAB_politics_template_001',
      economy: 'DAB_economy_template_001',
      sports: 'DAB_sports_template_001',
      technology: 'DAB_tech_template_001',
      entertainment: 'DAB_entertainment_template_001',
      lotteries: 'DAB_lotteries_template_001',
      other: 'DAB_default_template_001',
    };

    return templates[category] || templates['other'];
  }

  /**
   * Verifica se Canva está configurado
   */
  static isConfigured(): boolean {
    return !!process.env.CANVA_API_KEY;
  }

  /**
   * Factory method
   */
  static create(): CanvaGenerator | null {
    const apiKey = process.env.CANVA_API_KEY;
    if (!apiKey) {
      logger.warn('Canva API key not configured - art generation disabled');
      return null;
    }

    return new CanvaGenerator({
      apiKey,
      brandId: process.env.CANVA_BRAND_ID,
    });
  }
}

export const canvaGenerator = CanvaGenerator.create();
