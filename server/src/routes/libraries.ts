import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireUser } from '../auth.js';
import { db } from '../db.js';
import { scanLibrary } from '../media/scanner.js';
import type { LibraryRow } from '../types.js';

const newLibrary = z.object({
  name: z.string().min(1).max(120),
  path: z.string().min(1),
  kind: z.enum(['movies', 'shows', 'music', 'other']).default('movies'),
});

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/libraries', { preHandler: requireUser }, async () => {
    const libraries = db
      .prepare(`
        SELECT l.*, (SELECT COUNT(*) FROM items WHERE items.library_id = l.id) AS item_count
        FROM libraries l ORDER BY l.name
      `)
      .all();
    return { libraries };
  });

  app.post('/api/libraries', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = newLibrary.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'name, path and kind are required' });
    }
    const path = resolve(parsed.data.path);
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      return reply.code(400).send({ error: `not a readable folder: ${path}` });
    }
    if (db.prepare('SELECT id FROM libraries WHERE path = ?').get(path)) {
      return reply.code(409).send({ error: 'a library already covers this folder' });
    }
    const info = db
      .prepare('INSERT INTO libraries (name, path, kind) VALUES (?, ?, ?)')
      .run(parsed.data.name, path, parsed.data.kind);
    const library = db
      .prepare('SELECT * FROM libraries WHERE id = ?')
      .get(info.lastInsertRowid) as LibraryRow;
    return reply.code(201).send({ library });
  });

  app.delete('/api/libraries/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const info = db.prepare('DELETE FROM libraries WHERE id = ?').run(Number(id));
    if (info.changes === 0) return reply.code(404).send({ error: 'library not found' });
    return { deleted: true };
  });

  app.post('/api/libraries/:id/scan', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const library = db.prepare('SELECT * FROM libraries WHERE id = ?').get(Number(id)) as
      | LibraryRow
      | undefined;
    if (!library) return reply.code(404).send({ error: 'library not found' });
    const report = await scanLibrary(library);
    return { report };
  });
}
