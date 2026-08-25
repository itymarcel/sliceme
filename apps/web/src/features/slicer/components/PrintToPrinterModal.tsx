import { useEffect, useRef, useState } from 'react';
import { Info, LoaderCircle, Printer, X } from 'lucide-react';

import type { GcodeResult } from '../types';

type PrinterType = 'octoprint' | 'moonraker';

type SavedPrinter = {
  type: PrinterType;
  host: string;
  apiKey: string;
};

const STORAGE_KEY = 'sliceme.printer';

function loadSaved(): SavedPrinter | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedPrinter) : null;
  } catch {
    return null;
  }
}

function savePrinter(printer: SavedPrinter) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(printer));
  } catch {
    /* sessionStorage unavailable — non-fatal */
  }
}

type Props = {
  gcode: GcodeResult;
  onClose: () => void;
  onSuccess: (host: string) => void;
};

export function PrintToPrinterModal({ gcode, onClose, onSuccess }: Props) {
  const saved = useRef<SavedPrinter | null>(loadSaved());
  const [type, setType] = useState<PrinterType>(saved.current?.type ?? 'octoprint');
  const [host, setHost] = useState(saved.current?.host ?? '');
  const [apiKey, setApiKey] = useState(saved.current?.apiKey ?? '');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    const trimmedHost = host.trim().replace(/\/+$/, '');
    if (!trimmedHost) {
      setStatus('error');
      setMessage('Enter the printer host (hostname or IP).');
      return;
    }
    const base = /^https?:\/\//.test(trimmedHost) ? trimmedHost : `http://${trimmedHost}`;
    const file = new File([gcode.blob], gcode.fileName, { type: 'application/octet-stream' });
    setStatus('sending');
    setMessage('Sending to printer…');

    try {
      if (type === 'octoprint') {
        const form = new FormData();
        form.append('file', file);
        form.append('print', 'true');
        const res = await fetch(`${base}/api/files/local`, {
          method: 'POST',
          headers: { 'X-Api-Key': apiKey.trim() },
          body: form,
        });
        if (!res.ok) throw new Error(`OctoPrint responded ${res.status}`);
      } else {
        const form = new FormData();
        form.append('file', file);
        form.append('root', 'gcodes');
        const upload = await fetch(`${base}/printer/files/upload`, {
          method: 'POST',
          headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {},
          body: form,
        });
        if (!upload.ok) throw new Error(`Moonraker upload responded ${upload.status}`);
        const body = await upload.json().catch(() => null);
        const path = body?.result?.item?.path ?? gcode.fileName;
        const start = await fetch(`${base}/printer/print/start`, {
          method: 'POST',
          headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {},
          body: JSON.stringify({ path }),
        });
        if (!start.ok) throw new Error(`Moonraker print start responded ${start.status}`);
      }
      savePrinter({ type, host: trimmedHost, apiKey: apiKey.trim() });
      onSuccess(trimmedHost);
    } catch (error) {
      // CORS on LAN printers commonly blocks the response while the request still fires.
      const blocked = error instanceof TypeError;
      setStatus('error');
      setMessage(
        blocked
          ? 'Request sent, but the printer blocked the response (CORS). If it did not start, enable CORS on the printer or run the local proxy.'
          : error instanceof Error
            ? error.message
            : 'Send failed.',
      );
    }
  };

  return (
    <div className="gcode-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="print-modal panel" role="dialog" aria-modal="true" aria-labelledby="print-modal-title">
        <header>
          <div>
            <span className="eyebrow">Send to printer</span>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>

        <div className="print-modal-body">
          <p className="print-info-hint">
            <Info size={13} />
            <span>Enable CORS in your printer host&rsquo;s system settings for the connection to work.</span>
          </p>
          <label className="print-field">
            <span>Printer type</span>
            <select value={type} onChange={(event) => setType(event.target.value as PrinterType)}>
              <option value="octoprint">OctoPrint</option>
              <option value="moonraker">Klipper / Moonraker</option>
            </select>
          </label>
          <label className="print-field">
            <span>Printer host (hostname or IP)</span>
            <input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="printer.local or 192.168.1.50"
              autoFocus
            />
          </label>
          <label className="print-field">
            <span>API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={type === 'octoprint' ? 'OctoPrint API key' : 'Moonraker token (optional)'}
            />
          </label>
          {message && (
            <p className={`print-status print-status-${status}`} role="status">{message}</p>
          )}
        </div>

        <footer>
          <button className="button ghost" type="button" onClick={onClose}><X size={14} /> Cancel</button>
          <button className="button primary" type="button" disabled={status === 'sending'} onClick={send}>
            {status === 'sending' ? <LoaderCircle size={14} className="spin" /> : <Printer size={14} />} Send to printer
          </button>
        </footer>
      </section>
    </div>
  );
}
