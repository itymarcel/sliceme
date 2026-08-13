import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { HelpDiagram } from '../lib/settingHelp';

type Props = { label: string; text: string; diagram?: HelpDiagram };
type Position = { left: number; top: number; side: 'left' | 'right'; anchor: 'pointer' | 'trigger' };

const GAP = 12;
const CARD_WIDTH = 270;
const EDGE = 12;

function Diagram({ type }: { type: HelpDiagram }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className="parameter-help-diagram" viewBox="0 0 120 54" aria-hidden="true">
      {type === 'nozzle' && <><path {...common} d="M42 8h36l-5 24-8 7H55l-8-7z" /><path {...common} d="M55 39h10M52 46h16" strokeWidth="3" /><path {...common} d="M48 46h24m-20-4-4 4 4 4m16-8 4 4-4 4" /></>}
      {type === 'layers' && <><path {...common} d="M19 42h61M22 35h58M25 28h55M28 21h52M31 14h49" /><path {...common} d="M91 28v7m-4-3 4 3 4-3m-8-1 4-3 4 3" /></>}
      {type === 'first-layer' && <><path {...common} d="M16 44h88" /><path {...common} d="M25 37h62" strokeWidth="7" /><path {...common} d="M28 28h59M31 21h56M34 14h53" /><path {...common} d="M98 37v7m-4-3 4 3 4-3" /></>}
      {type === 'width' && <><path {...common} d="M18 27h84" strokeWidth="8" /><path {...common} d="M18 13v28m84-28v28M22 10l-4 3 4 3m76-6 4 3-4 3" /></>}
      {type === 'walls' && <><rect {...common} x="22" y="10" width="76" height="34" rx="8" /><rect {...common} x="29" y="17" width="62" height="20" rx="5" /><rect {...common} x="36" y="23" width="48" height="8" rx="3" /></>}
      {type === 'infill' && <><rect {...common} x="22" y="8" width="76" height="38" rx="5" /><path {...common} d="M25 39 55 9m-17 37L75 9M58 46 95 9M25 22l24 24M25 9l37 37M45 9l37 37M65 9l30 30" /></>}
      {type === 'infill-density' && <><rect {...common} x="10" y="10" width="42" height="34" rx="4" /><path {...common} d="M13 38 40 11M28 44l23-23" /><rect {...common} x="68" y="10" width="42" height="34" rx="4" /><path {...common} d="M70 20h38M70 30h38M78 11v32M88 11v32M98 11v32" /></>}
      {type === 'support-enable' && <><path {...common} d="M18 44h84M29 12h62l-13 13H42z" /><path {...common} d="M42 42V25m12 17V25m12 17V25m12 17V25" strokeDasharray="3 2" /></>}
      {type === 'support-angle' && <><path {...common} d="M18 43h84M30 40 76 14" /><path {...common} d="M30 40h46" strokeDasharray="3 3" /><path {...common} d="M46 40a16 16 0 0 0-2-8" /><path {...common} d="m46 32 1 5-5-1" /></>}
      {type === 'brim-type' && <><rect {...common} x="8" y="11" width="28" height="32" rx="4" /><rect {...common} x="15" y="18" width="14" height="18" rx="2" /><path {...common} d="M11 15h22v24H11z" strokeWidth="3" /><rect {...common} x="46" y="11" width="28" height="32" rx="4" /><rect {...common} x="53" y="18" width="14" height="18" rx="2" /><rect {...common} x="51" y="16" width="18" height="22" rx="3" strokeWidth="3" /><rect {...common} x="84" y="15" width="28" height="24" rx="4" /><circle {...common} cx="86" cy="17" r="4" strokeWidth="3" /><circle {...common} cx="110" cy="37" r="4" strokeWidth="3" /></>}
      {type === 'brim' && <><rect {...common} x="45" y="15" width="30" height="24" rx="4" /><rect {...common} x="34" y="8" width="52" height="38" rx="7" strokeWidth="4" /><path {...common} d="M86 27h20m-4-4 4 4-4 4M75 27h11" /><path {...common} d="M75 22v10m31-10v10" /></>}
      {type === 'skirt' && <><rect {...common} x="47" y="17" width="26" height="20" rx="4" /><rect {...common} x="33" y="8" width="54" height="38" rx="10" /><rect {...common} x="27" y="4" width="66" height="46" rx="13" /><path {...common} d="M73 27h14m-4-4 4 4-4 4" strokeDasharray="3 2" /></>}
      {type === 'raft' && <><path {...common} d="M18 45h84M39 25h42l-7-16H46zM30 31h60M27 37h66M24 43h72" /></>}
      {type === 'z-hop' && <><path {...common} d="M18 40h30m25 0h29M48 40v-15h25v15" /><path {...common} d="m44 29 4-4 4 4m17 0 4-4 4 4" /><path {...common} d="M21 17h18l-4-6h-10z" /></>}
      {type === 'motion' && <><rect {...common} x="28" y="13" width="42" height="28" rx="4" /><path {...common} d="M18 27h72m-5-5 5 5-5 5M49 47V7m-5 5 5-5 5 5" /><path {...common} d="M76 14c12 5 18 12 18 21" strokeDasharray="3 3" /></>}
      {type === 'rotation' && <><path {...common} d="M42 39a20 20 0 1 1 29-1" /><path {...common} d="m67 31 4 7 8-2" /><path {...common} d="M58 27V9m0 18 15 9m-15-9-14 10" /></>}
      {type === 'spiral' && <><path {...common} d="M35 44c-15-5-15-15 0-20 18-6 51-2 51 8 0 8-23 12-39 7-11-4-8-11 4-14 12-3 28 0 28 6 0 5-13 7-22 5-7-2-6-6 1-8" /><path {...common} d="M86 36V9m-4 5 4-5 4 5" /></>}
      {type === 'top-layers' && <><path {...common} d="M28 44h64V12H28zM33 38h54M33 32h54" strokeDasharray="4 3" /><path {...common} d="M28 12h64M28 17h64M28 22h64" strokeWidth="3" /></>}
      {type === 'bottom-layers' && <><path {...common} d="M28 42h64V10H28zM33 16h54M33 22h54" strokeDasharray="4 3" /><path {...common} d="M28 32h64M28 37h64M18 46h84" strokeWidth="3" /></>}
      {type === 'printable-height' && <><path {...common} d="M23 45h74M35 41h37l-6-25H41zM91 45V8m-5 5 5-5 5 5m-10 27 5 5 5-5" /></>}
      {type === 'z-offset' && <><path {...common} d="M18 43h84M42 31h36l-6-17H48z" /><path {...common} d="M90 14v29m-4-24 4-5 4 5m-8 19 4 5 4-5" /><path {...common} d="M31 34h50" strokeDasharray="4 3" /></>}
    </svg>
  );
}

export function ParameterHelp({ label, text, diagram }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ left: EDGE, top: EDGE, side: 'right', anchor: 'trigger' });
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  const place = (x: number, y: number, anchor: Position['anchor']) => {
    const availableWidth = Math.max(0, window.innerWidth - EDGE * 2);
    const width = Math.min(CARD_WIDTH, availableWidth);
    const fitsRight = x + GAP + width <= window.innerWidth - EDGE;
    const side = fitsRight ? 'right' : 'left';
    const preferredLeft = fitsRight ? x + GAP : x - GAP - width;
    setPosition({ left: Math.max(EDGE, Math.min(preferredLeft, window.innerWidth - EDGE - width)), top: y, side, anchor });
  };

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (open) { setOpen(false); return; }
    if (event.detail > 0) place(event.clientX, event.clientY, 'pointer');
    else {
      const rect = event.currentTarget.getBoundingClientRect();
      place(rect.right, rect.top + rect.height / 2, 'trigger');
    }
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;
    const height = popoverRef.current.getBoundingClientRect().height;
    if (!height) return;
    const top = Math.max(EDGE, Math.min(position.top, window.innerHeight - EDGE - height));
    if (top !== position.top) setPosition((current) => ({ ...current, top }));
  }, [open, position.top]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <span className="parameter-help" ref={rootRef}>
      <button type="button" className="parameter-help-trigger" aria-label={`About ${label}`} aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>
        <Info size={12} />
      </button>
      {open && (
        <span ref={popoverRef} className="parameter-help-popover" id={id} role="dialog" aria-label={`${label} information`} data-anchor={position.anchor} data-side={position.side} style={{ left: position.left, top: position.top }}>
          <strong>{label}</strong>
          {diagram && <Diagram type={diagram} />}
          <span>{text}</span>
        </span>
      )}
    </span>
  );
}
