import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  dataDir: string;
  dbPath: string;
  artworkDir: string;
  transcodeDir: string;
  port: number;
  host: string;
  jwtSecret: string;
}

function readConfig(): Config {
  const dataDir = resolve(process.env.FLIXLY_DATA_DIR ?? './data');
  const config: Config = {
    dataDir,
    dbPath: resolve(dataDir, 'flixly.db'),
    artworkDir: resolve(dataDir, 'artwork'),
    transcodeDir: resolve(dataDir, 'transcode'),
    port: Number(process.env.PORT ?? 8096),
    host: process.env.HOST ?? '0.0.0.0',
    jwtSecret: process.env.FLIXLY_JWT_SECRET ?? 'flixly-development-secret',
  };
  for (const dir of [config.dataDir, config.artworkDir, config.transcodeDir]) {
    mkdirSync(dir, { recursive: true });
  }
  return config;
}

export const config = readConfig();
