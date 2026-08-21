export interface SessionUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface Library {
  id: number;
  name: string;
  path: string;
  kind: 'movies' | 'shows' | 'music' | 'other';
  scanned_at: string | null;
  item_count: number;
}

export interface MediaItem {
  id: number;
  library_id: number;
  title: string;
  year: number | null;
  series: string | null;
  season: number | null;
  episode: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  size_bytes: number | null;
  artwork: string | null;
  position_seconds?: number | null;
  watched?: number | null;
}

export interface ScanReport {
  scanned: number;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

const TOKEN_KEY = 'flixly.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Media URLs are consumed by <img>/<video>, which cannot send headers. */
export function mediaUrl(path: string): string {
  const token = getToken();
  return token ? `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : path;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  status: () => request<{ needsSetup: boolean }>('/api/auth/status'),
  me: () => request<{ user: SessionUser }>('/api/auth/me'),
  setup: (username: string, password: string) =>
    request<{ token: string; user: SessionUser }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  libraries: () => request<{ libraries: Library[] }>('/api/libraries'),
  addLibrary: (name: string, path: string, kind: Library['kind']) =>
    request<{ library: Library }>('/api/libraries', {
      method: 'POST',
      body: JSON.stringify({ name, path, kind }),
    }),
  deleteLibrary: (id: number) =>
    request<{ deleted: boolean }>(`/api/libraries/${id}`, { method: 'DELETE' }),
  scanLibrary: (id: number) =>
    request<{ report: ScanReport }>(`/api/libraries/${id}/scan`, { method: 'POST' }),
  items: (params: { libraryId?: number; search?: string }) => {
    const query = new URLSearchParams();
    if (params.libraryId) query.set('libraryId', String(params.libraryId));
    if (params.search) query.set('search', params.search);
    return request<{ items: MediaItem[]; total: number }>(`/api/items?${query.toString()}`);
  },
  continueWatching: () => request<{ items: MediaItem[] }>('/api/items/continue'),
  item: (id: number) => request<{ item: MediaItem }>(`/api/items/${id}`),
  playback: (id: number) =>
    request<{ method: 'direct' | 'transcode'; url: string }>(`/api/items/${id}/playback`),
  saveProgress: (id: number, positionSeconds: number, watched: boolean) =>
    request<{ saved: boolean }>(`/api/items/${id}/progress`, {
      method: 'POST',
      body: JSON.stringify({ positionSeconds, watched }),
    }),
};
