import { useEffect, useRef } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';
const SESSION_KEY = 'sliceme.usage-session-id';

function getSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

function sendSessionUpdate(path: string, sessionId: string, activeSeconds: number) {
  const body = JSON.stringify({ session_id: sessionId, active_seconds: activeSeconds });
  void fetch(`${apiBase}/api/usage/session/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: path === 'end',
  }).catch(() => {
    // Usage tracking must never affect the slicer workspace.
  });
}

export function useUsageSession() {
  const activeMilliseconds = useRef(0);
  const visibleSince = useRef<number | null>(null);
  const ended = useRef(false);

  useEffect(() => {
    const sessionId = getSessionId();
    sendSessionUpdate('start', sessionId, 0);
    visibleSince.current = document.visibilityState === 'visible' ? performance.now() : null;

    const activeSeconds = () => {
      const current = visibleSince.current === null ? 0 : performance.now() - visibleSince.current;
      return Math.floor((activeMilliseconds.current + current) / 1000);
    };
    const pause = () => {
      if (visibleSince.current !== null) {
        activeMilliseconds.current += performance.now() - visibleSince.current;
        visibleSince.current = null;
      }
      sendSessionUpdate('heartbeat', sessionId, activeSeconds());
    };
    const resume = () => {
      if (!ended.current && visibleSince.current === null) visibleSince.current = performance.now();
    };
    const heartbeat = window.setInterval(() => {
      if (!ended.current && document.visibilityState === 'visible') sendSessionUpdate('heartbeat', sessionId, activeSeconds());
    }, 30000);
    const end = () => {
      if (ended.current) return;
      ended.current = true;
      pause();
      sendSessionUpdate('end', sessionId, activeSeconds());
    };

    const visibilityChange = () => {
      if (document.visibilityState === 'visible') resume();
      else pause();
    };
    document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('pagehide', end);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', visibilityChange);
      window.removeEventListener('pagehide', end);
    };
  }, []);
}
