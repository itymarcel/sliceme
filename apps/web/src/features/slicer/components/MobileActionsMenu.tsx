import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eraser,
  FileArchive,
  FileUp,
  Menu,
  PackageOpen,
  X,
} from 'lucide-react';

import { GitHubLinks, SupportLink } from './ProjectLinks';

type Props = {
  onAddModel: () => void;
  onImportProject: () => void;
  onExportProject: () => void;
  onClear: () => void;
  canClear: boolean;
  importingDisabled: boolean;
  exportingDisabled: boolean;
  download?: { href: string; fileName: string };
};

export function MobileActionsMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener('keydown', closeEscape);
    return () => window.removeEventListener('keydown', closeEscape);
  }, [open]);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="mobile-actions">
      <button
        ref={trigger}
        className="mobile-header-button"
        type="button"
        aria-label="Open main menu"
        aria-expanded={open}
        aria-controls="mobile-main-menu"
        onClick={() => setOpen((current) => !current)}
      ><Menu size={14} /></button>
      <button className={`mobile-menu-backdrop ${open ? 'is-open' : ''}`} type="button" aria-label="Close main menu" aria-hidden={!open} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <div id="mobile-main-menu" className={`mobile-main-menu panel ${open ? 'is-open' : ''}`} aria-label="Main menu" aria-hidden={!open}>
        <header><strong>SliceMe <small>Early beta</small></strong><button type="button" aria-label="Close main menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}><X size={16} /></button></header>
        <div className="mobile-menu-grid">
          <button type="button" tabIndex={open ? 0 : -1} onClick={() => run(props.onAddModel)}><FileUp size={16} /> Add model</button>
          <button type="button" tabIndex={open ? 0 : -1} disabled={props.importingDisabled} onClick={() => run(props.onImportProject)}><PackageOpen size={16} /> Import *.3mf</button>
          <button type="button" tabIndex={open ? 0 : -1} disabled={props.exportingDisabled} onClick={() => run(props.onExportProject)}><FileArchive size={16} /> Export 3MF</button>
          {props.download && <a aria-label="Download G-code" tabIndex={open ? 0 : -1} href={props.download.href} download={props.download.fileName} onClick={() => setOpen(false)}><Download size={16} /> Download G-code</a>}
          <button className="danger" type="button" tabIndex={open ? 0 : -1} disabled={!props.canClear} onClick={() => run(props.onClear)}><Eraser size={16} /> Clear workspace</button>
        </div>
        <div className="mobile-menu-links"><SupportLink /><GitHubLinks /></div>
      </div>
    </div>
  );
}
