import { useEffect, useRef } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';
const SESSION_KEY = 'sliceme.usage-session-id';

export function getUsageSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

function getSessionMetadata(): Record<string, unknown> {
  const userAgent = navigator.userAgent;
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Other';
  const os = /Windows/.test(userAgent) ? 'Windows' : /Mac OS X/.test(userAgent) ? 'macOS' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Linux/.test(userAgent) ? 'Linux' : 'Other';
  return { browser, os, user_agent: userAgent, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, screen: `${screen.width}x${screen.height}`, viewport: `${window.innerWidth}x${window.innerHeight}`, touch: navigator.maxTouchPoints > 0 };
}

function send(path: string, payload: Record<string, unknown>, keepalive = false) {
  void fetch(`${apiBase}/api/usage/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive,
  }).catch(() => { /* Usage tracking must never affect the slicer workspace. */ });
}

export function recordUsageEvent(eventType: string, success?: boolean, reason?: string) {
  send('event', { session_id: getUsageSessionId(), event_type: eventType, ...(success === undefined ? {} : { success }), ...(reason ? { reason } : {}) }, true);
}

export function useUsageSession() {
  const activeSeconds = useRef(0);
  const visibleSince = useRef<number | null>(null);
  const ended = useRef(false);

  useEffect(() => {
    const sessionId = getUsageSessionId();
    const now = () => Date.now();
    const flushActiveTime = () => {
      if (visibleSince.current !== null) {
        activeSeconds.current += Math.max(0, Math.floor((now() - visibleSince.current) / 1000));
        visibleSince.current = now();
      }
      return activeSeconds.current;
    };
    const update = (path: string, keepalive = false) => send(`session/${path}`, { session_id: sessionId, active_seconds: flushActiveTime() }, keepalive);
    const pause = () => { if (visibleSince.current !== null) { flushActiveTime(); visibleSince.current = null; } update('heartbeat'); };
    const resume = () => { if (!ended.current && visibleSince.current === null) visibleSince.current = now(); };
    const visibilityChange = () => { if (document.visibilityState === 'visible') resume(); else pause(); };
    const end = () => { if (ended.current) return; ended.current = true; update('end', true); };

    send('session/start', { session_id: sessionId, active_seconds: 0, metadata: getSessionMetadata() });
    resume();
    const heartbeat = window.setInterval(() => {
      if (!ended.current && document.visibilityState === 'visible') update('heartbeat');
    }, 30000);
    document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('pagehide', end);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', visibilityChange);
      window.removeEventListener('pagehide', end);
    };
  }, []);
}
