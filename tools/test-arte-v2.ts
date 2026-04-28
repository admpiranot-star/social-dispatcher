/**
 * Test script — Generate v2 artes for visual comparison
 * Run: npx tsx test-arte-v2.ts
 */

import { SatoriArtGenerator } from './src/media/satori-art-generator.js';

async function main() {
  const gen = new SatoriArtGenerator();

  const testCases = [
    {
      name: '01-policial-long',
      title: 'Mergulhadores não encontram vítima que estava no veículo que caiu em córrego de Piracicaba; família acompanha busca',
      category: 'policial',
      imageUrl: 'https://piranot.com.br/wp-content/uploads/2026/04/Sem-titulo-1.jpeg',
    },
    {
      name: '02-tecnologia-medium',
      title: 'Pedigree lança plataforma com IA para adoção de cães no Brasil',
      category: 'tecnologia',
      imageUrl: 'https://piranot.com.br/wp-content/uploads/2026/04/felca-com-cao.jpeg',
    },
    {
      name: '03-loteria-short',
      title: 'Lotofácil 3653: confira o resultado de hoje',
      category: 'loterias',
      imageUrl: 'https://piranot.com.br/wp-content/uploads/2026/03/piranot-placeholder-1.jpg',
    },
    {
      name: '04-local-very-long',
      title: 'Dr. Sérgio Pacheco, vice-prefeito e ex-secretário de Saúde estreia coluna no PIRANOT na segunda-feira (06)',
      category: 'politics',
      imageUrl: 'https://piranot.com.br/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-02-at-13.30.08.jpeg',
    },
    {
      name: '05-chuva-no-image',
      title: 'Chuva forte provoca alagamentos em avenidas de Piracicaba',
      category: 'other',
      // No image — tests placeholder background
    },
  ];

  console.log(`\n=== Arte v2 Test Generation ===\n`);

  for (const tc of testCases) {
    try {
      console.log(`Generating: ${tc.name} (${tc.title.length} chars)`);
      const result = await gen.generate({
        title: tc.title,
        category: tc.category,
        imageUrl: tc.imageUrl,
        format: 'feed',
      });
      console.log(`  ✓ ${result.filePath} (${result.generationTimeMs}ms, bg: ${result.backgroundSource})`);
    } catch (err: any) {
      console.error(`  ✗ FAILED: ${err.message}`);
    }
  }

  console.log(`\n=== Done! Check /tmp/piranot-artes/ ===\n`);
}

main().catch(console.error);
