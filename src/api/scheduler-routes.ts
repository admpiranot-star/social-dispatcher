import { Hono } from 'hono';
import { query } from '../db/client';
import { logger } from '../lib/logger';
import { dispatcher } from '../dispatcher';

export const schedulerRouter = new Hono();

// GET /scheduler/upcoming - Lista posts programados
schedulerRouter.get('/scheduler/upcoming', async (c) => {
  try {
    const result = await query(`
      SELECT 
        p.id, p.title, p.category, p.status, p.priority,
        q.scheduled_at, q.channel, q.tier
      FROM posts p
      JOIN queue_state q ON p.id = q.post_id
      WHERE q.scheduled_at > NOW() - INTERVAL '1 hour'
      ORDER BY q.scheduled_at ASC
      LIMIT 50
    `);
    return c.json({ success: true, data: result.rows });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /scheduler/force/:postId - Disparar agora (Bypass)
schedulerRouter.post('/scheduler/force/:postId', async (c) => {
  const postId = c.req.param('postId');
  try {
    // Busca o post original
    const post = await query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (post.rows.length === 0) return c.json({ error: 'Post not found' }, 404);

    // Reaproveita o dispatcher com Prioridade 10 para bypass imediato
    const payload = post.rows[0];
    const results = await dispatcher.dispatch({
      ...payload,
      priority: 10,
      channels: [c.req.query('channel') || 'facebook']
    });

    return c.json({ success: true, data: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
