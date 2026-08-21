import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createUser, findUser, requireUser, userCount, verifyPassword } from '../auth.js';

const credentials = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // The first account to be created owns the server; afterwards setup is closed.
  app.get('/api/auth/status', async () => ({ needsSetup: userCount() === 0 }));

  app.post('/api/auth/setup', async (request, reply) => {
    if (userCount() > 0) {
      return reply.code(409).send({ error: 'this server already has an owner' });
    }
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'username and 8+ character password required' });
    }
    const user = createUser(parsed.data.username, parsed.data.password, true);
    return { token: app.jwt.sign(user, { expiresIn: '30d' }), user };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'username and password required' });
    }
    const row = findUser(parsed.data.username);
    if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
      return reply.code(401).send({ error: 'incorrect username or password' });
    }
    const user = { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
    return { token: app.jwt.sign(user, { expiresIn: '30d' }), user };
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (request) => ({ user: request.user }));
}
