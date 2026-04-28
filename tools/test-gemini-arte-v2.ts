/**
 * test-gemini-arte-v2.ts — Gemini Nanobanana v2: 1 referência por cor + prompt refinado
 *
 * Correções vs v1:
 *   - Envia APENAS a referência correspondente à cor da categoria (não mistura azul+vermelho)
 *   - Prompt mais detalhado e específico sobre a composição
 *   - Mais casos de teste (5 artes)
 *
 * Uso: npx tsx test-gemini-arte-v2.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import sharp from 'sharp';

const GEMINI_API_KEY = 'AIzaSyB1V-MZvp0gyCOzIE02nE0DgbizsP_zZg8';
const MODEL = 'nano-banana-pro-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const WP_ARTES_DIR = '/opt/web/piranot/volumes/wp_data/wp-content/uploads/artes';

// One reference per color scheme
const REF_BLUE = '/tmp/ig-audit/02-sergio-pacheco.jpg';   // Blue politics
const REF_RED = '/tmp/ig-audit/05-policial.jpg';           // Red police

// Categories that use red
const RED_CATEGORIES = new Set(['policial', 'police', 'crime', 'segurança']);

const testCases = [
  {
    title: 'Vice-prefeito de Piracicaba é preso em operação do Ministério Público',
    category: 'Política',
    color: 'azul',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/Piracicaba-1-1-scaled.jpg',
  },
  {
    title: 'Policial é baleado durante perseguição na zona norte de Campinas',
    category: 'Policial',
    color: 'vermelho',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/pc-goias-crime.jpg',
  },
  {
    title: 'Jovem morre em acidente de moto na rodovia entre Piracicaba e Limeira',
    category: 'Policial',
    color: 'vermelho',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/jovem-morre-acidente-moto-e1741966722953.jpg',
  },
  {
    title: 'Casal de São Pedro comemora 60 anos de casamento com festa para 200 convidados',
    category: 'Geral',
    color: 'azul',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/04/casal-sao-pedro.jpg',
  },
  {
    title: 'Orquestra Filarmônica se apresenta no Teatro Municipal de Piracicaba neste sábado',
    category: 'Entretenimento',
    color: 'azul',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/04/A-maestra-Erica-Hindrikson-_foto-Rodrigo-Alves.jpg',
  },
];

async function loadReference(path: string): Promise<{ base64: string; mimeType: string }> {
  const resized = await sharp(readFileSync(path))
    .resize(1080, 1350, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { base64: resized.toString('base64'), mimeType: 'image/jpeg' };
}

async function downloadImage(url: string): Promise<{ base64: string; mimeType: string }> {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const resized = await sharp(Buffer.from(resp.data))
    .resize(1080, 1350, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { base64: resized.toString('base64'), mimeType: 'image/jpeg' };
}

function buildPrompt(title: string, category: string, color: string): string {
  const colorHex = color === 'vermelho' ? '#cc0000' : '#1e50b4';

  return `Gere uma arte para Instagram (1080x1350 pixels) para o portal de notícias PIRANOT.

A IMAGEM DE REFERÊNCIA MOSTRA EXATAMENTE o estilo visual que você deve replicar. Copie o layout, as proporções e o design FIELMENTE.

USE A FOTO DO ARTIGO como imagem de fundo. NÃO invente ou altere a foto — use ela como base.

TÍTULO DA NOTÍCIA (escreva EXATAMENTE este texto, sem alterar NENHUMA palavra):
"${title.toUpperCase()}"

LAYOUT OBRIGATÓRIO (de cima para baixo):
1. METADE SUPERIOR (0-60%): A foto do artigo domina, com pouco ou nenhum escurecimento. A foto é a protagonista.
2. GRADIENTE (40-80%): Gradiente preto suave que escurece progressivamente de cima para baixo.
3. CAIXA DE TÍTULO (63-78%): Retângulo com fundo semi-transparente cor ${color} (${colorHex}, 80% opacidade), bordas arredondadas. Dentro: o título em CAIXA ALTA, fonte condensada bold (estilo Oswald) BRANCA com contorno preto grosso. Máximo 4 linhas.
4. BARRA "LEIA EM" (80-84%): Barra fina escura com um pequeno círculo ${color} com ícone "@" e texto "LEIA EM:   WWW.PIRANOT.COM" em branco.
5. RODAPÉ (84-100%): Barra escura quase preta com: à esquerda "JC" em quadrado com borda branca + "PIRANOT" grande em fonte condensada branca + "JORNAL" pequeno em vermelho. À direita "S" em círculo com borda branca + "EJUCA" grande em fonte condensada branca.

REGRAS:
- Dimensões EXATAS: 1080x1350 pixels
- O texto do título deve ser PERFEITAMENTE legível
- Copie FIELMENTE o estilo da imagem de referência
- A foto do artigo deve ser REAL (a que foi enviada), não uma imagem inventada
- Categoria: ${category}`;
}

async function generateArte(
  prompt: string,
  articleImage: { base64: string; mimeType: string },
  refImage: { base64: string; mimeType: string },
): Promise<Buffer | null> {

  const parts: any[] = [
    // Reference image first
    { inlineData: { mimeType: refImage.mimeType, data: refImage.base64 } },
    { text: 'IMAGEM DE REFERÊNCIA: Copie EXATAMENTE este layout e estilo visual. Esta é a arte modelo.' },
    // Article photo
    { inlineData: { mimeType: articleImage.mimeType, data: articleImage.base64 } },
    { text: 'FOTO DO ARTIGO: Use esta foto como imagem de fundo da arte. Não altere a foto.' },
    // Prompt
    { text: prompt },
  ];

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.3,
    },
  };

  const startTime = Date.now();
  const response = await axios.post(API_URL, requestBody, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 180000,
    maxContentLength: 50 * 1024 * 1024,
  });
  const elapsed = Date.now() - startTime;
  console.log(`       Gemini respondeu em ${elapsed}ms`);

  const candidates = response.data?.candidates || [];
  if (!candidates.length) {
    console.error('       Sem candidatos:', JSON.stringify(response.data).substring(0, 300));
    return null;
  }

  for (const part of candidates[0]?.content?.parts || []) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
    if (part.text) {
      console.log(`       Texto: ${part.text.substring(0, 150)}`);
    }
  }

  return null;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  PiraNOT Arte — Gemini Nanobanana v2 (1 ref per color) ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Load references once
  console.log('Carregando referências...');
  const refBlue = await loadReference(REF_BLUE);
  console.log('  ✓ Referência azul (02-sergio-pacheco)');
  const refRed = await loadReference(REF_RED);
  console.log('  ✓ Referência vermelha (05-policial)\n');

  const results: string[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const isRed = tc.color === 'vermelho';
    const ref = isRed ? refRed : refBlue;
    const filename = `gemini-v2-${i + 1}.png`;

    console.log(`[${i + 1}/${testCases.length}] ${tc.title.substring(0, 65)}...`);
    console.log(`       Cat: ${tc.category} | Cor: ${tc.color} | Ref: ${isRed ? 'vermelha' : 'azul'}`);

    try {
      console.log('       Baixando foto...');
      const articleImg = await downloadImage(tc.imageUrl);

      const prompt = buildPrompt(tc.title, tc.category, tc.color);
      console.log('       Gerando com Gemini...');
      const imgBuffer = await generateArte(prompt, articleImg, ref);

      if (!imgBuffer) {
        console.log('       ✗ Sem imagem na resposta\n');
        continue;
      }

      // Ensure exact dimensions
      const final = await sharp(imgBuffer)
        .resize(1080, 1350, { fit: 'cover' })
        .png({ compressionLevel: 6 })
        .toBuffer();

      const wpPath = join(WP_ARTES_DIR, filename);
      writeFileSync(wpPath, final);

      const url = `https://piranot.com.br/wp-content/uploads/artes/${filename}`;
      console.log(`       ✓ ${url}\n`);
      results.push(url);

    } catch (err: any) {
      console.error(`       ✗ ERRO: ${err.message}`);
      if (err.response?.data) {
        console.error('       ', JSON.stringify(err.response.data).substring(0, 400));
      }
      console.log();
    }
  }

  console.log('════════════════════════════════════════');
  console.log('RESULTADOS:');
  console.log('════════════════════════════════════════');
  results.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
  console.log();
}

main().catch(console.error);
