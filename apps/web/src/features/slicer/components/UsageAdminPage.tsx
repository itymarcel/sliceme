import { useState } from 'react';

type UsageSession = {
  id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  active_seconds: number;
  heartbeat_count: number;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Active';
}

export function UsageAdminPage() {
  const [token, setToken] = useState('');
  const [sessions, setSessions] = useState<UsageSession[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/usage/sessions', {
        headers: { 'X-Usage-Admin-Token': token },
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'Invalid admin token.' : `Request failed (${response.status}).`);
      const body = await response.json() as { sessions: UsageSession[] };
      setSessions(body.sessions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load usage sessions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="usage-admin-page">
      <section className="usage-admin-card">
        <div className="usage-admin-header">
          <div>
            <span className="usage-admin-eyebrow">SliceMe</span>
            <h1>Usage sessions</h1>
          </div>
          <a href="/">Back to app</a>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void loadSessions(); }} className="usage-admin-form">
          <label htmlFor="usage-admin-token">Admin token</label>
          <div className="usage-admin-controls">
            <input
              id="usage-admin-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste USAGE_ADMIN_TOKEN"
              autoComplete="off"
            />
            <button type="submit" disabled={loading || !token}>{loading ? 'Loading…' : 'Load sessions'}</button>
          </div>
        </form>
        {error && <p className="usage-admin-error">{error}</p>}
        <div className="usage-admin-table-wrap">
          <table>
            <thead><tr><th>Started</th><th>Last active</th><th>Active duration</th><th>Status</th></tr></thead>
            <tbody>
              {sessions.length === 0
                ? <tr><td colSpan={4} className="usage-admin-empty">No sessions loaded.</td></tr>
                : sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{formatDate(session.started_at)}</td>
                    <td>{formatDate(session.last_seen_at)}</td>
                    <td>{formatDuration(session.active_seconds)}</td>
                    <td>{session.ended_at ? 'Ended' : 'Active'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
