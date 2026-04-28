
import { query } from './src/db/client';

async function cleanQueue() {
  console.log('🧹 LIMPANDO FILA DO SDC (FACEBOOK)...');
  
  try {
    // 1. Remover duplicatas: Manter apenas a ocorrência mais RECENTE de cada título de post
    // Usamos um CTE para identificar os IDs que devem ser MANTIDOS.
    const delDuplicados = await query(`
      DELETE FROM queue_state 
      WHERE id NOT IN (
        SELECT DISTINCT ON (p.title) q.id
        FROM queue_state q
        JOIN posts p ON q.post_id = p.id
        ORDER BY p.title, q.scheduled_at DESC
      )
    `);
    console.log(`✅ Duplicatas removidas: ${delDuplicados.rowCount}`);

    // 2. Remover posts agendados para o passado (mais de 1 hora atrás)
    const delAntigos = await query(`
      DELETE FROM queue_state 
      WHERE scheduled_at < NOW() - INTERVAL '1 hour'
    `);
    console.log(`✅ Posts antigos/atrasados removidos: ${delAntigos.rowCount}`);

    // 3. Resultado final da fila
    const final = await query("SELECT channel, COUNT(*) FROM queue_state GROUP BY channel");
    console.log('-----------------------------------------');
    console.log('ESTADO ATUAL DA FILA (PÓS-LIMPEZA):');
    final.rows.forEach(r => console.log(`${r.channel}: ${r.count} posts`));
    console.log('-----------------------------------------');

  } catch (err: any) {
    console.error('❌ ERRO NA LIMPEZA:', err.message);
  }
}

cleanQueue();
