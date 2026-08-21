import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import type { ItemRow, LibraryRow } from '../types.js';
import { extractThumbnail, probe } from './ffmpeg.js';
import { parseName, sortTitle } from './filename.js';

export const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm', '.wmv', '.mpg', '.mpeg', '.ts',
]);

export interface ScanReport {
  libraryId: number;
  scanned: number;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

async function walk(dir: string, found: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, found);
    } else if (VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

function artworkName(path: string): string {
  return `${createHash('sha1').update(path).digest('hex')}.jpg`;
}

/**
 * Reconciles a library folder with the database: new files are probed, changed
 * files are re-probed, and rows whose file disappeared are dropped.
 */
export async function scanLibrary(library: LibraryRow): Promise<ScanReport> {
  const report: ScanReport = {
    libraryId: library.id,
    scanned: 0,
    added: 0,
    updated: 0,
    removed: 0,
    errors: [],
  };

  const root = resolve(library.path);
  if (!existsSync(root)) {
    report.errors.push(`library path does not exist: ${root}`);
    return report;
  }

  const files = await walk(root);
  const existing = db
    .prepare('SELECT * FROM items WHERE library_id = ?')
    .all(library.id) as ItemRow[];
  const byPath = new Map(existing.map((item) => [item.path, item]));

  const insert = db.prepare(`
    INSERT INTO items (
      library_id, path, title, sort_title, year, series, season, episode,
      duration_seconds, width, height, video_codec, audio_codec, container,
      size_bytes, mtime_ms, artwork
    ) VALUES (
      @library_id, @path, @title, @sort_title, @year, @series, @season, @episode,
      @duration_seconds, @width, @height, @video_codec, @audio_codec, @container,
      @size_bytes, @mtime_ms, @artwork
    )
    ON CONFLICT(path) DO UPDATE SET
      title = excluded.title,
      sort_title = excluded.sort_title,
      year = excluded.year,
      series = excluded.series,
      season = excluded.season,
      episode = excluded.episode,
      duration_seconds = excluded.duration_seconds,
      width = excluded.width,
      height = excluded.height,
      video_codec = excluded.video_codec,
      audio_codec = excluded.audio_codec,
      container = excluded.container,
      size_bytes = excluded.size_bytes,
      mtime_ms = excluded.mtime_ms,
      artwork = excluded.artwork
  `);

  for (const file of files) {
    report.scanned += 1;
    try {
      const stats = await stat(file);
      const mtimeMs = Math.round(stats.mtimeMs);
      const known = byPath.get(file);
      if (known && known.mtime_ms === mtimeMs && known.size_bytes === stats.size) continue;

      const name = basename(file, extname(file));
      const parent = basename(join(file, '..'));
      const parsed = parseName(name, parent);
      const probed = await probe(file);

      const artwork = artworkName(file);
      const artworkPath = join(config.artworkDir, artwork);
      let artworkValue: string | null = artwork;
      try {
        await extractThumbnail(file, artworkPath, probed.durationSeconds);
      } catch {
        artworkValue = null;
      }

      insert.run({
        library_id: library.id,
        path: file,
        title: parsed.title,
        sort_title: sortTitle(parsed.series ?? parsed.title),
        year: parsed.year,
        series: parsed.series,
        season: parsed.season,
        episode: parsed.episode,
        duration_seconds: probed.durationSeconds,
        width: probed.width,
        height: probed.height,
        video_codec: probed.videoCodec,
        audio_codec: probed.audioCodec,
        container: probed.container,
        size_bytes: stats.size,
        mtime_ms: mtimeMs,
        artwork: artworkValue,
      });

      if (known) report.updated += 1;
      else report.added += 1;
    } catch (error) {
      report.errors.push(`${file}: ${(error as Error).message}`);
    }
  }

  const present = new Set(files);
  const remove = db.prepare('DELETE FROM items WHERE id = ?');
  for (const item of existing) {
    if (!present.has(item.path)) {
      remove.run(item.id);
      report.removed += 1;
    }
  }

  db.prepare("UPDATE libraries SET scanned_at = datetime('now') WHERE id = ?").run(library.id);
  return report;
}
