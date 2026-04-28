import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const ASSETS_DIR = '/home/admpiranot/nexus-publisher/services/social-dispatcher/assets';
const REF_DIR = '/tmp/ig-audit';

async function main() {
  console.log('=== REFERENCE IMAGE DIMENSIONS ===');
  const refs = ['02-sergio-pacheco.jpg', '03-acipi.jpg', '04-saude.jpg', '05-policial.jpg', '06-vice-prefeito.jpg'];
  
  for (const ref of refs) {
    const meta = await sharp(`${REF_DIR}/${ref}`).metadata();
    console.log(`${ref}: ${meta.width}x${meta.height} (${meta.format})`);
  }
  
  const meta = await sharp(`${REF_DIR}/06-vice-prefeito.jpg`).metadata();
  const W = meta.width!;
  const H = meta.height!;
  console.log(`\nBase: ${W}x${H}`);
  
  // ─── Footer extraction ───
  // Footer in Canva: dark bar ~bottom 15%. 
  // From visual analysis: footer dark bar starts around Y=1140, logos centered at ~Y=1220-1280
  const footerTop = 1140;
  const footerHeight = H - footerTop; // 210px
  console.log(`\nFooter: Y=${footerTop} to ${H} (${footerHeight}px)`);
  
  const footerBuf = await sharp(`${REF_DIR}/06-vice-prefeito.jpg`)
    .extract({ left: 0, top: footerTop, width: W, height: footerHeight })
    .png()
    .toBuffer();
  await writeFile(`${ASSETS_DIR}/footer-canva.png`, footerBuf);
  console.log(`Saved footer-canva.png (${footerBuf.length} bytes)`);

  // Also extract a wider footer from 02-sergio-pacheco (blue theme) for comparison
  const footer02 = await sharp(`${REF_DIR}/02-sergio-pacheco.jpg`)
    .extract({ left: 0, top: footerTop, width: W, height: footerHeight })
    .png()
    .toBuffer();
  await writeFile(`${ASSETS_DIR}/footer-canva-02.png`, footer02);
  console.log(`Saved footer-canva-02.png (${footer02.length} bytes)`);

  // Extract footer from policial (red theme)
  const footer05 = await sharp(`${REF_DIR}/05-policial.jpg`)
    .extract({ left: 0, top: footerTop, width: W, height: footerHeight })
    .png()
    .toBuffer();
  await writeFile(`${ASSETS_DIR}/footer-canva-05.png`, footer05);
  console.log(`Saved footer-canva-05.png (${footer05.length} bytes)`);
  
  // ─── LEIA EM extraction ───
  // LEIA EM bar sits between title and footer, roughly Y=1080-1130
  const leiaTop = 1075;
  const leiaBot = 1140;
  const leiaBuf = await sharp(`${REF_DIR}/06-vice-prefeito.jpg`)
    .extract({ left: 0, top: leiaTop, width: W, height: leiaBot - leiaTop })
    .png()
    .toBuffer();
  await writeFile(`${ASSETS_DIR}/leia-em-canva.png`, leiaBuf);
  console.log(`Saved leia-em-canva.png (${leiaBuf.length} bytes)`);

  // ─── Title area extraction (for analysis) ───
  // Title box in 06 spans roughly Y=850-1060
  const titleArea = await sharp(`${REF_DIR}/06-vice-prefeito.jpg`)
    .extract({ left: 0, top: 830, width: W, height: 250 })
    .png()
    .toBuffer();
  await writeFile(`${ASSETS_DIR}/title-area-canva.png`, titleArea);
  console.log(`Saved title-area-canva.png for reference`);

  // ─── Bottom half extraction from multiple refs (for detailed analysis) ───
  const analysisDir = '/tmp/canva-analysis';
  if (!existsSync(analysisDir)) await mkdir(analysisDir, { recursive: true });
  
  for (const ref of refs) {
    const bottomHalf = await sharp(`${REF_DIR}/${ref}`)
      .extract({ left: 0, top: Math.round(H * 0.5), width: W, height: Math.round(H * 0.5) })
      .png()
      .toBuffer();
    await writeFile(`${analysisDir}/bottom-${ref.replace('.jpg','.png')}`, bottomHalf);
    console.log(`Saved bottom half of ${ref}`);
  }
  
  console.log('\n=== EXTRACTION COMPLETE ===');
}

main().catch(console.error);
