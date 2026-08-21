import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import type { ItemRow } from '../types.js';

const listQuery = z.object({
  libraryId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

const progressBody = z.object({
  positionSeconds: z.number().min(0),
  watched: z.boolean().optional(),
});

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/items', { preHandler: requireUser }, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query parameters' });
    const { libraryId, search, limit, offset } = parsed.data;

    const filters: string[] = [];
    const params: Record<string, unknown> = { user_id: request.user.id, limit, offset };
    if (libraryId) {
      filters.push('i.library_id = @library_id');
      params.library_id = libraryId;
    }
    if (search) {
      filters.push('(i.title LIKE @search OR IFNULL(i.series, \'\') LIKE @search)');
      params.search = `%${search}%`;
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const items = db
      .prepare(`
        SELECT i.*, p.position_seconds, p.watched
        FROM items i
        LEFT JOIN playback_state p ON p.item_id = i.id AND p.user_id = @user_id
        ${where}
        ORDER BY i.sort_title, i.season, i.episode, i.title
        LIMIT @limit OFFSET @offset
      `)
      .all(params);
    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM items i ${where}`)
      .get(params) as { count: number };

    return { items, total: total.count, limit, offset };
  });

  app.get('/api/items/continue', { preHandler: requireUser }, async (request) => {
    const items = db
      .prepare(`
        SELECT i.*, p.position_seconds, p.watched
        FROM playback_state p
        JOIN items i ON i.id = p.item_id
        WHERE p.user_id = ? AND p.watched = 0 AND p.position_seconds > 30
        ORDER BY p.updated_at DESC
        LIMIT 20
      `)
      .all(request.user.id);
    return { items };
  });

  app.get('/api/items/:id', { preHandler: requireUser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = db
      .prepare(`
        SELECT i.*, p.position_seconds, p.watched
        FROM items i
        LEFT JOIN playback_state p ON p.item_id = i.id AND p.user_id = ?
        WHERE i.id = ?
      `)
      .get(request.user.id, Number(id)) as ItemRow | undefined;
    if (!item) return reply.code(404).send({ error: 'item not found' });
    return { item };
  });

  app.post('/api/items/:id/progress', { preHandler: requireUser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = progressBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'positionSeconds is required' });
    const exists = db.prepare('SELECT id FROM items WHERE id = ?').get(Number(id));
    if (!exists) return reply.code(404).send({ error: 'item not found' });

    db.prepare(`
      INSERT INTO playback_state (user_id, item_id, position_seconds, watched, updated_at)
      VALUES (@user_id, @item_id, @position, @watched, datetime('now'))
      ON CONFLICT(user_id, item_id) DO UPDATE SET
        position_seconds = excluded.position_seconds,
        watched = excluded.watched,
        updated_at = excluded.updated_at
    `).run({
      user_id: request.user.id,
      item_id: Number(id),
      position: parsed.data.positionSeconds,
      watched: parsed.data.watched ? 1 : 0,
    });
    return { saved: true };
  });
}
