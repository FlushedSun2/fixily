import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, type Library, type MediaItem, type SessionUser } from './api.js';
import { ItemCard } from './components/ItemCard.js';
import { Libraries } from './components/Libraries.js';
import { Login } from './components/Login.js';
import { Player } from './components/Player.js';

type View = 'home' | 'settings';

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('home');
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [activeLibrary, setActiveLibrary] = useState<number | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [continueItems, setContinueItems] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        const status = await api.status();
        setNeedsSetup(status.needsSetup);
        if (!status.needsSetup && getToken()) {
          const me = await api.me();
          setUser(me.user);
        }
      } catch {
        setToken(null);
      } finally {
        setReady(true);
      }
    }
    void bootstrap();
  }, []);

  const refreshLibraries = useCallback(async () => {
    const { libraries: rows } = await api.libraries();
    setLibraries(rows);
  }, []);

  const refreshItems = useCallback(async () => {
    const [{ items: rows }, { items: resume }] = await Promise.all([
      api.items({ libraryId: activeLibrary ?? undefined, search: search || undefined }),
      api.continueWatching(),
    ]);
    setItems(rows);
    setContinueItems(resume);
  }, [activeLibrary, search]);

  useEffect(() => {
    if (!user) return;
    void refreshLibraries().catch((caught: unknown) => setError((caught as Error).message));
  }, [user, refreshLibraries]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      void refreshItems().catch((caught: unknown) => setError((caught as Error).message));
    }, 150);
    return () => clearTimeout(timer);
  }, [user, refreshItems]);

  const heading = useMemo(() => {
    if (search) return `Results for “${search}”`;
    const library = libraries.find((entry) => entry.id === activeLibrary);
    return library ? library.name : 'All media';
  }, [search, libraries, activeLibrary]);

  function signOut() {
    setToken(null);
    setUser(null);
    setItems([]);
    setLibraries([]);
  }

  if (!ready) return <div className="loading">Loading…</div>;

  if (!user) {
    return (
      <Login
        needsSetup={needsSetup}
        onAuthenticated={(token, authenticated) => {
          setToken(token);
          setUser(authenticated);
          setNeedsSetup(false);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView('home')}>
          flixly
        </button>
        <input
          className="search"
          type="search"
          placeholder="Search your library"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <nav>
          <button className="ghost" type="button" onClick={() => setView('settings')}>
            Settings
          </button>
          <button className="ghost" type="button" onClick={signOut}>
            Sign out ({user.username})
          </button>
        </nav>
      </header>

      {error ? <p className="error banner">{error}</p> : null}

      {view === 'settings' ? (
        <main className="content">
          <Libraries
            libraries={libraries}
            canManage={user.isAdmin}
            onChanged={() => {
              void refreshLibraries();
              void refreshItems();
            }}
          />
        </main>
      ) : (
        <div className="layout">
          <aside className="sidebar">
            <button
              className={activeLibrary === null ? 'active' : ''}
              type="button"
              onClick={() => setActiveLibrary(null)}
            >
              All media
            </button>
            {libraries.map((library) => (
              <button
                key={library.id}
                className={activeLibrary === library.id ? 'active' : ''}
                type="button"
                onClick={() => setActiveLibrary(library.id)}
              >
                {library.name}
                <span className="count">{library.item_count}</span>
              </button>
            ))}
          </aside>

          <main className="content">
            {continueItems.length > 0 && !search ? (
              <section>
                <h2>Continue watching</h2>
                <div className="grid">
                  {continueItems.map((item) => (
                    <ItemCard key={`resume-${item.id}`} item={item} onPlay={setPlaying} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2>{heading}</h2>
              {items.length === 0 ? (
                <p className="muted">
                  Nothing here yet. Add a folder in Settings and Flixly will scan it.
                </p>
              ) : (
                <div className="grid">
                  {items.map((item) => (
                    <ItemCard key={item.id} item={item} onPlay={setPlaying} />
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      )}

      {playing ? (
        <Player
          item={playing}
          onClose={() => {
            setPlaying(null);
            void refreshItems();
          }}
        />
      ) : null}
    </div>
  );
}
