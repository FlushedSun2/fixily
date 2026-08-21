import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import staticPlugin from '@fastify/static';
import Fastify from 'fastify';
import { config } from './config.js';
import './db.js';
import { authRoutes } from './routes/auth.js';
import { itemRoutes } from './routes/items.js';
import { libraryRoutes } from './routes/libraries.js';
import { streamRoutes } from './routes/stream.js';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../web/dist');

export async function buildServer() {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret });

  app.get('/api/health', async () => ({ status: 'ok' }));
  await app.register(authRoutes);
  await app.register(libraryRoutes);
  await app.register(itemRoutes);
  await app.register(streamRoutes);

  // In production the built single page app is served from the same origin.
  if (existsSync(join(webRoot, 'index.html'))) {
    await app.register(staticPlugin, { root: webRoot });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: config.port, host: config.host });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
