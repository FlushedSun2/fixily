import { useState, type FormEvent } from 'react';
import { api, type SessionUser } from '../api.js';

interface LoginProps {
  needsSetup: boolean;
  onAuthenticated: (token: string, user: SessionUser) => void;
}

export function Login({ needsSetup, onAuthenticated }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = needsSetup
        ? await api.setup(username, password)
        : await api.login(username, password);
      onAuthenticated(result.token, result.user);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="brand">flixly</h1>
        <p className="auth-subtitle">
          {needsSetup ? 'Create the owner account for this server.' : 'Sign in to your server.'}
        </p>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          autoComplete="username"
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete={needsSetup ? 'new-password' : 'current-password'}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : needsSetup ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
