import { useState, type FormEvent } from 'react';
import { api, type Library, type ScanReport } from '../api.js';

interface LibrariesProps {
  libraries: Library[];
  canManage: boolean;
  onChanged: () => void;
}

export function Libraries({ libraries, canManage, onChanged }: LibrariesProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [kind, setKind] = useState<Library['kind']>('movies');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<number, ScanReport>>({});

  async function addLibrary(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { library } = await api.addLibrary(name, path, kind);
      setName('');
      setPath('');
      const { report } = await api.scanLibrary(library.id);
      setReports((current) => ({ ...current, [library.id]: report }));
      onChanged();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function scan(library: Library) {
    setBusy(true);
    setError(null);
    try {
      const { report } = await api.scanLibrary(library.id);
      setReports((current) => ({ ...current, [library.id]: report }));
      onChanged();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(library: Library) {
    setBusy(true);
    try {
      await api.deleteLibrary(library.id);
      onChanged();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Libraries</h2>
      {libraries.length === 0 ? <p className="muted">No libraries yet.</p> : null}
      <ul className="library-list">
        {libraries.map((library) => (
          <li key={library.id}>
            <div>
              <strong>{library.name}</strong>
              <span className="muted"> · {library.item_count} items · {library.path}</span>
              {reports[library.id] ? (
                <p className="muted">
                  Added {reports[library.id]?.added}, updated {reports[library.id]?.updated},
                  removed {reports[library.id]?.removed}
                  {reports[library.id]?.errors.length ? `, ${reports[library.id]?.errors.length} errors` : ''}
                </p>
              ) : null}
            </div>
            {canManage ? (
              <div className="row-actions">
                <button type="button" onClick={() => void scan(library)} disabled={busy}>
                  Scan
                </button>
                <button className="ghost" type="button" onClick={() => void remove(library)} disabled={busy}>
                  Remove
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {canManage ? (
        <form className="library-form" onSubmit={addLibrary}>
          <h3>Add a folder</h3>
          <div className="field-row">
            <input
              aria-label="Library name"
              placeholder="Movies"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <input
              aria-label="Folder path on the server"
              placeholder="/srv/media/movies"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              required
            />
            <select
              aria-label="Library kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as Library['kind'])}
            >
              <option value="movies">Movies</option>
              <option value="shows">Shows</option>
              <option value="music">Music</option>
              <option value="other">Other</option>
            </select>
            <button type="submit" disabled={busy}>
              {busy ? 'Scanning…' : 'Add & scan'}
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
