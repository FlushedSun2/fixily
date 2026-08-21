import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('movies', 'shows', 'music', 'other')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  scanned_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  sort_title TEXT NOT NULL,
  year INTEGER,
  series TEXT,
  season INTEGER,
  episode INTEGER,
  duration_seconds REAL,
  width INTEGER,
  height INTEGER,
  video_codec TEXT,
  audio_codec TEXT,
  container TEXT,
  size_bytes INTEGER,
  mtime_ms INTEGER NOT NULL,
  artwork TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS items_library_idx ON items(library_id, sort_title);
CREATE INDEX IF NOT EXISTS items_series_idx ON items(series, season, episode);

CREATE TABLE IF NOT EXISTS playback_state (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position_seconds REAL NOT NULL DEFAULT 0,
  watched INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, item_id)
);
`);
