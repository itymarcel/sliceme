import { useState } from 'react';

type UsageSession = {
  id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  active_seconds: number;
  heartbeat_count: number;
  slices_triggered: number;
  slices_succeeded: number;
  slices_failed: number;
};

type UsageSummary = { slices_triggered: number; slices_succeeded: number; slices_failed: number; failure_reasons: Array<{ reason: string; count: number }> };

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
  const [token, setToken] = useState(() => localStorage.getItem('sliceme.usage-admin-token') ?? '');
  const [sessions, setSessions] = useState<UsageSession[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
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
      const body = await response.json() as { summary: UsageSummary; sessions: UsageSession[] };
      localStorage.setItem('sliceme.usage-admin-token', token);
      setSummary(body.summary);
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
              onChange={(event) => { setToken(event.target.value); localStorage.setItem('sliceme.usage-admin-token', event.target.value); }}
              placeholder="Paste USAGE_ADMIN_TOKEN"
              autoComplete="off"
            />
            <button type="submit" disabled={loading || !token}>{loading ? 'Loading…' : 'Load sessions'}</button>
            <button type="button" onClick={() => { setToken(''); localStorage.removeItem('sliceme.usage-admin-token'); }}>Clear</button>
          </div>
        </form>
        {error && <p className="usage-admin-error">{error}</p>}
        {summary && <div className="usage-admin-summary"><strong>{summary.slices_triggered}</strong> triggered · <strong>{summary.slices_succeeded}</strong> successful · <strong>{summary.slices_failed}</strong> failed{summary.failure_reasons.length > 0 && <span> · {summary.failure_reasons.map((item) => `${item.reason} (${item.count})`).join(' · ')}</span>}</div>}
        <div className="usage-admin-table-wrap">
          <table>
            <thead><tr><th>Started</th><th>Last active</th><th>Active duration</th><th>Slices</th><th>Status</th></tr></thead>
            <tbody>
              {sessions.length === 0
                ? <tr><td colSpan={5} className="usage-admin-empty">No sessions loaded.</td></tr>
                : sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{formatDate(session.started_at)}</td>
                    <td>{formatDate(session.last_seen_at)}</td>
                    <td>{formatDuration(session.active_seconds)}</td>
                    <td>{session.slices_succeeded}/{session.slices_triggered} successful</td>
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
