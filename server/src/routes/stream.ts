import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db.js';
import type { ItemRow } from '../types.js';

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
};

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

const MISSING_FILE_MESSAGE = 'this file is no longer on disk, rescan the library';

function findItem(id: string): ItemRow | undefined {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(Number(id)) as ItemRow | undefined;
}

/** Browsers can play these containers/codecs as-is, so no transcode is needed. */
function isDirectPlayable(item: ItemRow): boolean {
  const container = extname(item.path).toLowerCase();
  if (!['.mp4', '.m4v', '.webm'].includes(container)) return false;
  const video = item.video_codec ?? '';
  const audio = item.audio_codec ?? '';
  return ['h264', 'vp8', 'vp9', 'av1'].includes(video) && ['aac', 'mp3', 'opus', 'vorbis'].includes(audio);
}

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/items/:id/artwork', { preHandler: requireUser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = findItem(id);
    if (!item?.artwork) return reply.code(404).send({ error: 'no artwork for this item' });
    if (!existsSync(join(config.artworkDir, item.artwork))) {
      return reply.code(404).send({ error: 'artwork is missing, rescan the library' });
    }
    return reply
      .type('image/jpeg')
      .header('cache-control', 'public, max-age=86400')
      .send(createReadStream(join(config.artworkDir, item.artwork)));
  });

  app.get('/api/items/:id/playback', { preHandler: requireUser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = findItem(id);
    if (!item) return reply.code(404).send({ error: 'item not found' });
    return {
      method: isDirectPlayable(item) ? 'direct' : 'transcode',
      url: isDirectPlayable(item) ? `/api/items/${item.id}/stream` : `/api/items/${item.id}/transcode`,
    };
  });

  app.get('/api/items/:id/stream', { preHandler: requireUser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = findItem(id);
    if (!item) return reply.code(404).send({ error: 'item not found' });
    if (!existsSync(item.path)) return reply.code(410).send({ error: MISSING_FILE_MESSAGE });

    const { size } = await stat(item.path);
    const contentType = MIME_TYPES[extname(item.path).toLowerCase()] ?? 'application/octet-stream';
    void reply.header('accept-ranges', 'bytes').type(contentType);

    const range = RANGE_PATTERN.exec(request.headers.range ?? '');
    if (!range) {
      return reply.header('content-length', size).send(createReadStream(item.path));
    }

    const [, rawStart, rawEnd] = range;
    const start = rawStart ? Number(rawStart) : 0;
    const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
    if (start >= size || start > end) {
      return reply.code(416).header('content-range', `bytes */${size}`).send();
    }
    return reply
      .code(206)
      .header('content-range', `bytes ${start}-${end}/${size}`)
      .header('content-length', end - start + 1)
      .send(createReadStream(item.path, { start, end }));
  });

  // Remuxes/transcodes on the fly into fragmented MP4 so any browser can play it.
  app.get('/api/items/:id/transcode', { preHandler: requireUser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = findItem(id);
    if (!item) return reply.code(404).send({ error: 'item not found' });
    if (!existsSync(item.path)) return reply.code(410).send({ error: MISSING_FILE_MESSAGE });

    const query = request.query as { start?: string };
    const start = Number(query.start ?? 0);
    const seek = Number.isFinite(start) && start > 0 ? start : 0;
    const copyVideo = ['h264', 'vp9', 'av1'].includes(item.video_codec ?? '');

    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      ...(seek > 0 ? ['-ss', String(seek)] : []),
      '-i', item.path,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', copyVideo ? 'copy' : 'libx264',
      ...(copyVideo ? [] : ['-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p']),
      '-c:a', 'aac',
      '-ac', '2',
      '-b:a', '192k',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    ffmpeg.on('close', (code) => {
      if (code !== null && code !== 0) app.log.error({ code, stderr }, 'transcode failed');
    });
    request.raw.on('close', () => ffmpeg.kill('SIGKILL'));

    return sendStream(reply, ffmpeg.stdout);
  });
}

function sendStream(reply: FastifyReply, stream: NodeJS.ReadableStream): FastifyReply {
  return reply
    .type('video/mp4')
    .header('cache-control', 'no-store')
    .send(stream);
}
