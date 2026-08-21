export interface ItemRow {
  id: number;
  library_id: number;
  path: string;
  title: string;
  sort_title: string;
  year: number | null;
  series: string | null;
  season: number | null;
  episode: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  container: string | null;
  size_bytes: number | null;
  mtime_ms: number;
  artwork: string | null;
  added_at: string;
}

export interface LibraryRow {
  id: number;
  name: string;
  path: string;
  kind: 'movies' | 'shows' | 'music' | 'other';
  created_at: string;
  scanned_at: string | null;
}
