# Flixly

A self-hosted media server. Point it at folders of video files and it builds its own
library database, pulls technical metadata and artwork with ffmpeg, and streams to any
browser — direct play when the file is already web-friendly, on-the-fly transcode when
it is not.

Nothing is shared with a third party: the library lives in a local SQLite file you own.

## Features

- Folder libraries (movies / shows / music / other) with rescan and removal
- Scanner: filename parsing (title, year, `SxxEyy`, release-noise stripping), ffprobe
  metadata (duration, resolution, codecs), auto-generated thumbnails
- Incremental scans — unchanged files (same size + mtime) are skipped, missing files pruned
- Accounts: the first account created owns the server; scrypt password hashing, JWT sessions
- Playback: HTTP range direct play, fragmented-MP4 transcode fallback, resume points and
  a "Continue watching" row
- Search across titles and series
- React web UI served by the same process in production

## Requirements

- Node.js 20+
- `ffmpeg` and `ffprobe` on `PATH`

## Getting started

```bash
npm install
cp .env.example .env      # set FLIXLY_JWT_SECRET
npm run build
npm start                 # http://localhost:8096
```

Open the UI, create the owner account, then go to **Settings → Add a folder** and give it
an absolute path on the server (e.g. `/srv/media/movies`). The first scan runs immediately.

For development, `npm run dev` runs the API on `:8096` and Vite on `:5173` with a proxy.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLIXLY_DATA_DIR` | `./data` | SQLite database, artwork cache, transcode scratch |
| `PORT` | `8096` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `FLIXLY_JWT_SECRET` | dev fallback | Session signing secret — set this in production |

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/auth/status` | whether the server still needs an owner |
| `POST` | `/api/auth/setup` / `/api/auth/login` | returns `{ token, user }` |
| `GET` | `/api/libraries` | libraries with item counts |
| `POST` | `/api/libraries` | admin: add a folder |
| `POST` | `/api/libraries/:id/scan` | admin: rescan, returns a scan report |
| `DELETE` | `/api/libraries/:id` | admin: remove a library and its items |
| `GET` | `/api/items` | `libraryId`, `search`, `limit`, `offset` |
| `GET` | `/api/items/continue` | in-progress items for the current user |
| `GET` | `/api/items/:id` | single item with playback state |
| `POST` | `/api/items/:id/progress` | save resume position / watched flag |
| `GET` | `/api/items/:id/playback` | chooses direct play vs transcode |
| `GET` | `/api/items/:id/stream` | range-capable direct stream |
| `GET` | `/api/items/:id/transcode` | fragmented MP4, optional `?start=` seconds |
| `GET` | `/api/items/:id/artwork` | generated thumbnail |

Requests authenticate with `Authorization: Bearer <token>`; media URLs additionally accept
`?token=<token>` because `<img>` and `<video>` cannot send headers.

## Scripts

```bash
npm run dev         # API + web with hot reload
npm run build       # compile server, bundle web
npm run typecheck
npm run lint
npm test            # scanner/filename unit tests
```
