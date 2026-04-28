/**
 * test-arte-v4.ts — Gera 5 artes de teste para validação visual
 *
 * Usa títulos reais do PiraNOT com diferentes categorias para testar
 * todas as variantes visuais (azul, vermelho, etc).
 *
 * Uso: npx tsx test-arte-v4.ts
 */

import { SatoriArtGenerator } from './src/media/satori-art-generator.js';

const generator = new SatoriArtGenerator();

const testCases = [
  {
    title: 'Vice-prefeito de Piracicaba é preso em operação do Ministério Público',
    category: 'politics',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/Piracicaba-1-1-scaled.jpg',
  },
  {
    title: 'Policial é baleado durante perseguição na zona norte de Campinas',
    category: 'policial',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/pc-goias-crime.jpg',
  },
  {
    title: 'Jovem morre em acidente de moto na rodovia entre Piracicaba e Limeira',
    category: 'policial',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/03/jovem-morre-acidente-moto-e1741966722953.jpg',
  },
  {
    title: 'Casal de São Pedro comemora 60 anos de casamento com festa para 200 convidados',
    category: 'other',
    imageUrl: 'https://piranot.com.br/wp-content/uploads/2025/04/casal-sao-pedro.jpg',
  },
  {
    title: 'Mega-Sena acumula e prêmio chega a R$ 120 milhões para o próximo sorteio',
    category: 'lotteries',
    imageUrl: null,  // Test placeholder background
  },
];

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  PiraNOT Arte Generator v4 — Test Suite  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log();

  const results: { title: string; url: string; time: number }[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[${i + 1}/5] Gerando: ${tc.title.substring(0, 60)}...`);
    console.log(`       Categoria: ${tc.category} | Imagem: ${tc.imageUrl ? 'sim' : 'placeholder'}`);

    try {
      const result = await generator.generateAndPublish({
        title: tc.title,
        category: tc.category,
        imageUrl: tc.imageUrl || undefined,
        format: 'feed',
      });

      console.log(`       ✓ OK em ${result.generationTimeMs}ms`);
      console.log(`       URL: ${result.publicUrl}`);
      console.log();

      results.push({
        title: tc.title.substring(0, 50),
        url: result.publicUrl,
        time: result.generationTimeMs,
      });
    } catch (err: any) {
      console.error(`       ✗ ERRO: ${err.message}`);
      console.log();
    }
  }

  console.log('═══════════════════════════════════════════');
  console.log('RESULTADOS:');
  console.log('═══════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.title}...`);
    console.log(`  ${r.url}`);
    console.log(`  (${r.time}ms)`);
    console.log();
  }
}

main().catch(console.error);
