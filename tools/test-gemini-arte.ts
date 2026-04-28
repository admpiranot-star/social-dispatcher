/**
 * test-gemini-arte.ts — Gera artes usando Gemini Nanobanana (image generation)
 *
 * Envia referências das artes do Canva + foto do artigo e pede para o Gemini
 * gerar uma arte no mesmo estilo visual.
 *
 * Uso: npx tsx test-gemini-arte.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import sharp from 'sharp';

const GEMINI_API_KEY = 'AIzaSyB1V-MZvp0gyCOzIE02nE0DgbizsP_zZg8';
const MODEL = 'nano-banana-pro-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const OUTPUT_DIR = '/tmp/piranot-artes';
const WP_ARTES_DIR = '/opt/web/piranot/volumes/wp_data/wp-content/uploads/artes';

// Reference Canva artes (style examples)
const CANVA_REFS = [
  '/tmp/ig-audit/02-sergio-pacheco.jpg',   // Blue politics
  '/tmp/ig-audit/05-policial.jpg',          // Red police
];

// Test articles with real photos
const testCases = [
  {
    title: 'Vice-prefeito de Piracicaba é preso em operação do Ministério Público',
    category: 'Política',
    categoryColor: 'azul (#1e50b4)',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/Piracicaba-1-1-scaled.jpg',
  },
  {
    title: 'Policial é baleado durante perseguição na zona norte de Campinas',
    category: 'Policial',
    categoryColor: 'vermelho (#cc0000)',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/pc-goias-crime.jpg',
  },
  {
    title: 'Jovem morre em acidente de moto na rodovia entre Piracicaba e Limeira',
    category: 'Policial',
    categoryColor: 'vermelho (#cc0000)',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/jovem-morre-acidente-moto-e1741966722953.jpg',
  },
];

function imageToBase64(path: string): string {
  return readFileSync(path).toString('base64');
}

function getMimeType(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function downloadImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const buffer = Buffer.from(resp.data);
  // Resize to max 1024px to reduce token usage
  const resized = await sharp(buffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { base64: resized.toString('base64'), mimeType: 'image/jpeg' };
}

async function generateArte(
  title: string,
  category: string,
  categoryColor: string,
  articleImageBase64: string,
  articleImageMime: string,
  refImages: { base64: string; mimeType: string }[],
): Promise<Buffer | null> {

  const prompt = `Você é um designer gráfico especialista em artes para Instagram de um portal de notícias brasileiro chamado PIRANOT.

TAREFA: Gere uma arte/imagem para Instagram no formato 1080x1350 pixels (retrato 4:5) para a seguinte notícia:

TÍTULO: "${title}"
CATEGORIA: ${category}

INSTRUÇÕES DE ESTILO (copie EXATAMENTE o estilo das imagens de referência enviadas):

1. FUNDO: Use a foto do artigo fornecida como imagem de fundo, redimensionada para cobrir todo o canvas 1080x1350
2. GRADIENTE: Aplique um gradiente escuro (preto) que vai de transparente no topo até quase opaco na parte inferior (~60% de baixo). A foto deve ser protagonista na metade superior.
3. CAIXA DE TÍTULO: Na posição ~63% do topo, coloque uma caixa retangular semi-transparente na cor da categoria (${categoryColor}) com ~80% opacidade, com bordas levemente arredondadas. Dentro dela, o título em CAIXA ALTA, fonte condensada bold branca com contorno preto grosso.
4. BARRA "LEIA EM": Logo abaixo da caixa de título, uma barra fina escura com um ícone circular colorido (${categoryColor}) e o texto "LEIA EM: WWW.PIRANOT.COM" em branco.
5. RODAPÉ: Na parte inferior (últimos ~210px), uma barra escura quase preta com os logos/marcas: à esquerda um ícone "JC" dentro de um quadrado com borda branca + texto "PIRANOT" em fonte condensada grande branca e "JORNAL" pequeno em vermelho abaixo. À direita um ícone "S" dentro de um círculo com borda branca + texto "EJUCA" em fonte condensada grande branca.

IMPORTANTE:
- O resultado deve parecer PROFISSIONAL, como uma arte feita no Canva
- Copie fielmente o layout, proporções e estilo das imagens de referência
- Dimensões EXATAS: 1080x1350 pixels
- O texto deve ser LEGÍVEL e BEM POSICIONADO
- Use EXATAMENTE o título fornecido, sem alterar nenhuma palavra`;

  const parts: any[] = [];

  // Add reference images first
  for (const ref of refImages) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.base64,
      },
    });
    parts.push({ text: '[Imagem de referência — copie este estilo visual exatamente]' });
  }

  // Add article photo
  parts.push({
    inlineData: {
      mimeType: articleImageMime,
      data: articleImageBase64,
    },
  });
  parts.push({ text: '[Foto do artigo — use como imagem de fundo da arte]' });

  // Add the prompt
  parts.push({ text: prompt });

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.4,
    },
  };

  console.log('       Enviando para Gemini Nanobanana...');
  const startTime = Date.now();

  const response = await axios.post(API_URL, requestBody, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
    maxContentLength: 50 * 1024 * 1024,
  });

  const elapsed = Date.now() - startTime;
  console.log(`       Resposta em ${elapsed}ms`);

  // Extract image from response
  const candidates = response.data?.candidates || [];
  if (candidates.length === 0) {
    console.error('       Nenhum candidato na resposta');
    console.error('       Response:', JSON.stringify(response.data).substring(0, 500));
    return null;
  }

  const responseParts = candidates[0]?.content?.parts || [];
  for (const part of responseParts) {
    if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
      console.log(`       Imagem recebida: ${part.inlineData.mimeType}`);
      return Buffer.from(part.inlineData.data, 'base64');
    }
    if (part.text) {
      console.log(`       Texto: ${part.text.substring(0, 200)}`);
    }
  }

  console.error('       Nenhuma imagem na resposta');
  console.error('       Parts types:', responseParts.map((p: any) => Object.keys(p)));
  return null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  PiraNOT Arte — Gemini Nanobanana Image Gen     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load reference images
  console.log('Carregando referências do Canva...');
  const refImages: { base64: string; mimeType: string }[] = [];
  for (const ref of CANVA_REFS) {
    if (existsSync(ref)) {
      // Resize reference to reduce token usage
      const resized = await sharp(readFileSync(ref))
        .resize(1024, 1280, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      refImages.push({
        base64: resized.toString('base64'),
        mimeType: 'image/jpeg',
      });
      console.log(`  ✓ ${ref}`);
    } else {
      console.log(`  ✗ ${ref} não encontrado`);
    }
  }
  console.log();

  const results: { title: string; url: string; time: number }[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[${i + 1}/${testCases.length}] ${tc.title.substring(0, 60)}...`);
    console.log(`       Cat: ${tc.category} (${tc.categoryColor})`);

    try {
      // Download article photo
      console.log('       Baixando foto do artigo...');
      const articleImg = await downloadImageAsBase64(tc.imageUrl);

      // Generate with Gemini
      const imageBuffer = await generateArte(
        tc.title,
        tc.category,
        tc.categoryColor,
        articleImg.base64,
        articleImg.mimeType,
        refImages,
      );

      if (!imageBuffer) {
        console.log('       ✗ Falha na geração');
        console.log();
        continue;
      }

      // Ensure exact 1080x1350 dimensions
      const finalBuffer = await sharp(imageBuffer)
        .resize(1080, 1350, { fit: 'cover' })
        .png({ compressionLevel: 6 })
        .toBuffer();

      // Save locally
      const filename = `gemini-v1-${i + 1}-${tc.category.toLowerCase()}.png`;
      const localPath = join(OUTPUT_DIR, filename);
      writeFileSync(localPath, finalBuffer);

      // Copy to WP uploads
      const wpPath = join(WP_ARTES_DIR, filename);
      writeFileSync(wpPath, finalBuffer);

      const publicUrl = `https://piranot.com.br/wp-content/uploads/artes/${filename}`;
      console.log(`       ✓ ${publicUrl}`);
      console.log();

      results.push({
        title: tc.title.substring(0, 50),
        url: publicUrl,
        time: 0,
      });
    } catch (err: any) {
      console.error(`       ✗ ERRO: ${err.message}`);
      if (err.response?.data) {
        console.error('       API Error:', JSON.stringify(err.response.data).substring(0, 500));
      }
      console.log();
    }
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('RESULTADOS:');
  console.log('═══════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.title}...`);
    console.log(`  ${r.url}`);
    console.log();
  }
}

main().catch(console.error);
