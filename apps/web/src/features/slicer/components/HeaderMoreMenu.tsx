import { useEffect, useRef, useState } from 'react';
import { FileArchive, FileUp, MoreHorizontal, PackageOpen } from 'lucide-react';

import { GitHubLinks } from './ProjectLinks';

type Props = {
  onAddModel: () => void;
  onImportProject: () => void;
  onExportProject: () => void;
  importingDisabled: boolean;
  exportingDisabled: boolean;
};

export function HeaderMoreMenu({ onAddModel, onImportProject, onExportProject, importingDisabled, exportingDisabled }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const run = (action: () => void) => { action(); setOpen(false); };
  return (
    <div className="header-more" ref={root}>
      <button className="button secondary header-more-trigger" type="button" aria-label="More project actions" aria-expanded={open} onClick={() => setOpen((current) => !current)}><MoreHorizontal size={17} /></button>
      {open && <div className="header-more-menu panel" role="menu">
        <button role="menuitem" onClick={() => run(onAddModel)}><FileUp size={15} /> Add model</button>
        <button role="menuitem" disabled={importingDisabled} onClick={() => run(onImportProject)}><PackageOpen size={15} /> Import *.3mf</button>
        <button role="menuitem" disabled={exportingDisabled} onClick={() => run(onExportProject)}><FileArchive size={15} /> Export 3MF</button>
        <GitHubLinks />
      </div>}
    </div>
  );
}
