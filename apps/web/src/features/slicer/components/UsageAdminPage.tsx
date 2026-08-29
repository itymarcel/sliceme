import { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';

type FailedSlice = { timestamp: string; reason: string };

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
  metadata: { browser?: string; os?: string; user_agent?: string; language?: string; timezone?: string; screen?: string; viewport?: string; touch?: boolean };

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
  const [selectedFailures, setSelectedFailures] = useState<UsageSession | null>(null);
  const [failures, setFailures] = useState<FailedSlice[]>([]);
  const [failuresLoading, setFailuresLoading] = useState(false);

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

  const openFailures = async (session: UsageSession) => {
    setSelectedFailures(session);
    setFailures([]);
    setFailuresLoading(true);
    try {
      const response = await fetch(`/api/admin/usage/sessions/${session.id}/failures`, { headers: { 'X-Usage-Admin-Token': token } });
      if (!response.ok) throw new Error(`Request failed (${response.status}).`);
      setFailures((await response.json() as { failures: FailedSlice[] }).failures);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load failed slices.');
    } finally {
      setFailuresLoading(false);
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
        {summary && <div className="usage-admin-summary"><strong>{summary.slices_triggered}</strong> triggered · <strong>{summary.slices_succeeded}</strong> successful · <strong>{summary.slices_failed}</strong> failed</div>}
        <div className="usage-admin-table-wrap">
          <table>
            <thead><tr><th>Started</th><th>Browser / OS</th><th>Last active</th><th>Active duration</th><th>Slices</th><th>Status</th></tr></thead>
            <tbody>
              {sessions.length === 0
                ? <tr><td colSpan={6} className="usage-admin-empty">No sessions loaded.</td></tr>
                : sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{formatDate(session.started_at)}</td>
                    <td title={session.metadata.user_agent}>{session.metadata.browser ?? 'Unknown'} · {session.metadata.os ?? 'Unknown'}</td>
                    <td>{formatDate(session.last_seen_at)}</td>
                    <td>{formatDuration(session.active_seconds)}</td>
                    <td><span>{session.slices_succeeded}/{session.slices_triggered} successful</span><button className="usage-admin-more" type="button" aria-label={`View failed slices for ${formatDate(session.started_at)}`} onClick={() => void openFailures(session)}><MoreHorizontal size={16} /></button></td>
                    <td>{session.ended_at ? 'Ended' : 'Active'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {selectedFailures && <div className="usage-admin-modal-backdrop" role="presentation" onClick={() => setSelectedFailures(null)}><section className="usage-admin-modal" role="dialog" aria-modal="true" aria-labelledby="failed-slices-title" onClick={(event) => event.stopPropagation()}>
          <header><div><span className="usage-admin-eyebrow">Session failures</span><h2 id="failed-slices-title">Unsuccessful slices</h2></div><button className="usage-admin-close" type="button" aria-label="Close" onClick={() => setSelectedFailures(null)}><X size={17} /></button></header>
          {failuresLoading ? <p className="usage-admin-empty">Loading failures…</p> : failures.length === 0 ? <p className="usage-admin-empty">No unsuccessful slices in this session.</p> : <div className="usage-admin-failures">{failures.map((failure, index) => <div className="usage-admin-failure" key={`${failure.timestamp}-${index}`}><time>{formatDate(failure.timestamp)}</time><span>{failure.reason}</span></div>)}</div>}
        </section></div>}
      </section>
    </main>
  );
}
