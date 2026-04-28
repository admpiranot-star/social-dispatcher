/**
 * Canva Art Generator - Simplified Version
 * Usa imagens/templates pré-existentes ao invés de gerar dinamicamente
 */

import { logger } from '../lib/logger';
import { SocialPostPayload } from '../types';

export interface ArtTemplate {
  url: string;
  width: number;
  height: number;
  category: string;
}

/**
 * Gerenciador de artes/templates pré-feitos para Instagram
 * Você pode usar URLs diretas, templates do Canva, ou imagens do servidor
 */
export class SimpleArtGenerator {
  private templates: Record<string, string> = {
    // Política
    politics: 'https://piranot.com.br/templates/politics-1080x1350.jpg',
    
    // Economia
    economy: 'https://piranot.com.br/templates/economy-1080x1350.jpg',
    
    // Esportes
    sports: 'https://piranot.com.br/templates/sports-1080x1350.jpg',
    
    // Tecnologia
    technology: 'https://piranot.com.br/templates/technology-1080x1350.jpg',
    
    // Entretenimento
    entertainment: 'https://piranot.com.br/templates/entertainment-1080x1350.jpg',
    
    // Loterias
    lotteries: 'https://piranot.com.br/templates/lotteries-1080x1350.jpg',
    
    // Padrão
    other: 'https://piranot.com.br/templates/default-1080x1350.jpg',
  };

  /**
   * Retorna arte/template baseado na categoria
   * Se houver imageUrl no payload, usa ela
   * Senão, retorna o template da categoria
   */
  async generateInstagramArt(
    payload: SocialPostPayload
  ): Promise<{ imageUrl: string; source: string }> {
    try {
      // Se enviou imagem, usa ela diretamente
      if (payload.imageUrl) {
        logger.info(
          { postId: payload.id, imageUrl: payload.imageUrl },
          'Using provided image'
        );
        return {
          imageUrl: payload.imageUrl,
          source: 'user-provided',
        };
      }

      // Senão, retorna template da categoria
      const template = this.templates[payload.category] || this.templates.other;
      
      logger.info(
        { postId: payload.id, category: payload.category, template },
        'Using category template'
      );

      return {
        imageUrl: template,
        source: 'category-template',
      };
    } catch (err: any) {
      logger.error(
        { postId: payload.id, error: err.message },
        'Failed to get art'
      );
      throw err;
    }
  }

  /**
   * Adiciona um novo template customizado
   * Útil para adicionar templates do Canva que você criar manualmente
   */
  addTemplate(category: string, url: string): void {
    this.templates[category] = url;
    logger.info({ category, url }, 'Template added');
  }

  /**
   * Retorna lista de templates disponíveis
   */
  getTemplates(): Record<string, string> {
    return { ...this.templates };
  }
}

export const artGenerator = new SimpleArtGenerator();
