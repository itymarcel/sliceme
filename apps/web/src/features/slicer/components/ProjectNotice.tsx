import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

export function ProjectNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [remaining, setRemaining] = useState(5);
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (paused) return;
    if (remaining <= 0) {
      onDismissRef.current();
      return;
    }
    const timer = window.setTimeout(() => setRemaining((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, paused]);

  return (
    <div className="project-notice" role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ShieldCheck size={17} />
      <span>{message}</span>
      <span className="notice-countdown">{remaining}s</span>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
