/**
 * Canva Templates Manager
 * Usa designs pré-criados do Canva com customização por categoria
 */

import { logger } from '../lib/logger';

export interface CanvaTemplate {
  designId: string;
  name: string;
  type: 'feed' | 'story';
  baseUrl: string;
  colors: Record<string, string>; // Cores por categoria
}

/**
 * Templates Canva customizáveis por categoria/tema
 * Você criou 2 designs base, agora customizamos a cor do fundo
 */
export class CanvaTemplatesManager {
  // Seus designs do Canva
  private templates = {
    feed: {
      designId: 'DAGfeh4a0QE',
      name: 'Feed Instagram',
      type: 'feed' as const,
      baseUrl: 'https://www.canva.com/design/DAGfeh4a0QE',
      editUrl: 'https://www.canva.com/design/DAGfeh4a0QE/Hj4aQ0IVZT7COOCCvdlOmA/edit',
    },
    story: {
      designId: 'DAFbivDtN2Y',
      name: 'Stories Instagram',
      type: 'story' as const,
      baseUrl: 'https://www.canva.com/design/DAFbivDtN2Y',
      editUrl: 'https://www.canva.com/design/DAFbivDtN2Y/qLT657x6U6tUy_rwlinM-A/edit',
    },
  };

  // Cores por categoria (para customizar background no Canva)
  private categoryColors = {
    politics: '#1a3a52',      // Azul escuro
    economy: '#2d5016',        // Verde
    sports: '#8b0000',         // Vermelho escuro
    technology: '#4b0082',     // Roxo
    entertainment: '#c71585',  // Magenta
    lotteries: '#ffd700',      // Ouro
    other: '#333333',          // Cinza escuro
  };

  /**
   * Retorna URL do template Canva com cor customizada por categoria
   */
  getTemplateUrl(
    type: 'feed' | 'story',
    category: string
  ): { url: string; color: string; designId: string } {
    const template = this.templates[type];
    const color = this.categoryColors[category as keyof typeof this.categoryColors] || this.categoryColors.other;

    logger.info(
      { type, category, color, designId: template.designId },
      'Template Canva retrieved'
    );

    return {
      url: template.editUrl,
      color,
      designId: template.designId,
    };
  }

  /**
   * Retorna template base sem customização
   */
  getBaseTemplate(type: 'feed' | 'story') {
    return this.templates[type];
  }

  /**
   * Retorna cor para uma categoria
   */
  getCategoryColor(category: string): string {
    return this.categoryColors[category as keyof typeof this.categoryColors] || this.categoryColors.other;
  }

  /**
   * Lista todas as cores disponíveis
   */
  getColors(): Record<string, string> {
    return { ...this.categoryColors };
  }

  /**
   * Gera instrução para customizar no Canva
   */
  getCustomizationInstructions(category: string, type: 'feed' | 'story'): string {
    const template = this.templates[type];
    const color = this.categoryColors[category as keyof typeof this.categoryColors] || this.categoryColors.other;

    return `
CUSTOMIZAÇÃO CANVA:
1. Abra: ${template.editUrl}
2. Selecione o elemento "Background Color" ou fundo
3. Mude a cor para: ${color}
4. Salve como: ${category}-${type}-1080x${type === 'feed' ? '1350' : '1920'}.png
5. Exporte como PNG
    `.trim();
  }
}

export const canvaTemplates = new CanvaTemplatesManager();

/**
 * Helper para exportar design do Canva
 * URLs de export do Canva (formato público)
 */
export function getCanvaExportUrl(designId: string, format: 'png' | 'jpg' = 'png'): string {
  // Formato de export público do Canva
  return `https://www.canva.com/api/design/${designId}/export/${format}`;
}

/**
 * Gera URL de compartilhamento/download do Canva
 */
export function getCanvaShareUrl(designId: string): string {
  return `https://www.canva.com/design/${designId}`;
}
