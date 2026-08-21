import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db.js';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
}

export interface SessionUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, derived] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !derived) return false;
  const expected = Buffer.from(derived, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}

export function userCount(): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  return row.count;
}

export function createUser(username: string, password: string, isAdmin: boolean): SessionUser {
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, hashPassword(password), isAdmin ? 1 : 0);
  return { id: Number(info.lastInsertRowid), username, isAdmin };
}

export function findUser(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

/**
 * Media elements cannot send an Authorization header, so streaming and artwork
 * URLs may carry the same token as a `token` query parameter instead.
 */
function extractToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  const query = request.query as { token?: string } | undefined;
  return query?.token;
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractToken(request);
  if (!token) {
    await reply.code(401).send({ error: 'authentication required' });
    return;
  }
  try {
    request.user = request.server.jwt.verify<SessionUser>(token);
  } catch {
    await reply.code(401).send({ error: 'invalid or expired session' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireUser(request, reply);
  if (reply.sent) return;
  if (!request.user.isAdmin) {
    await reply.code(403).send({ error: 'administrator access required' });
  }
}
