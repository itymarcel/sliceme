import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function TimeMachinePopover({ open, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current && !root.current.contains(target)) {
        if (target instanceof Element && target.closest('button[aria-label="Changelog"]')) return;
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || markdown !== null || fetchError) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetch('/changelog.md')
      .then((response) => {
        if (!response.ok) throw new Error(`changelog fetch failed: ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setMarkdown(text);
      })
      .catch((error) => {
        if (!cancelled) setFetchError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, markdown, fetchError]);

  if (!open) return null;

  let bodyContent: React.ReactNode;
  if (loading) {
    bodyContent = <div className="timemachine-loading" aria-live="polite">Loading changelog…</div>;
  } else if (fetchError) {
    bodyContent = (
      <div className="timemachine-error" role="alert">
        <strong>Could not load changelog</strong>
        <span>{fetchError}</span>
      </div>
    );
  } else if (markdown === null || markdown.trim() === '') {
    bodyContent = <div className="timemachine-empty">No changelog available.</div>;
  } else {
    bodyContent = (
      <div
        className="timemachine-markdown"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
      />
    );
  }

  return (
    <div className="timemachine-root" role="dialog" aria-label="Changelog" ref={root}>
      <header className="timemachine-header">
        <h2>Changelog</h2>
        <button className="icon-button" type="button" aria-label="Close changelog" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="timemachine-body">{bodyContent}</div>
    </div>
  );
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (!listOpen) return;
    html.push('</ul>');
    listOpen = false;
  };

  const addListItem = (text: string, extraClass = '') => {
    if (!listOpen) {
      html.push('<ul class="tm-list-block">');
      listOpen = true;
    }
    html.push(`<li class="tm-list${extraClass}">${formatInline(text)}</li>`);
  };

  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ').trimEnd();
    if (line.startsWith('## ')) {
      closeList();
      html.push(`<h3 class="tm-heading"><time>${escapeHtml(line.slice(3))}</time></h3>`);
    } else if (line.startsWith('### ')) {
      closeList();
      html.push(`<h4 class="tm-heading tm-heading-small">${formatInline(line.slice(4))}</h4>`);
    } else if (line.startsWith('#### ')) {
      closeList();
      html.push(`<h5 class="tm-heading tm-heading-small">${formatInline(line.slice(5))}</h5>`);
    } else if (line.startsWith('# ')) {
      closeList();
    } else if (line === '') {
      closeList();
    } else if (line.startsWith('- ') || line.startsWith('+ ') || line.startsWith('* ')) {
      addListItem(line.slice(2));
    } else if (line.startsWith('> ') || line.startsWith('— ') || line.startsWith('– ')) {
      addListItem(line.slice(2), ' tm-list-quote');
    } else if (line.trim() !== '') {
      closeList();
      html.push(`<p class="tm-para">${formatInline(line)}</p>`);
    }
  }

  closeList();
  return html.join('');
}

function formatInline(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
