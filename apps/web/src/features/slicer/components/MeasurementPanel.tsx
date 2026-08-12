import { Ruler, X } from 'lucide-react';

import { measurementBetween, type MeasurementPoint } from '../lib/measurement';

type Props = {
  active: boolean;
  disabled?: boolean;
  points: MeasurementPoint[];
  onToggle: () => void;
  onClear: () => void;
};

const millimetres = (value: number) => `${value.toFixed(2)} mm`;

export function MeasurementPanel({ active, disabled = false, points, onToggle, onClear }: Props) {
  const measurement = points.length === 2 ? measurementBetween(points[0], points[1]) : null;
  return (
    <div className={`measurement-panel panel ${active ? 'active' : ''}`}>
      <button className="measurement-toggle" aria-pressed={active} disabled={disabled} title={disabled ? 'Add a model to measure' : undefined} onClick={onToggle}>
        <Ruler size={15} /> Measure
      </button>
      {disabled && <div className="measurement-hint">Add a model to measure</div>}
      {active && (
        <div className="measurement-readout" role="status">
          <div className="measurement-snap-note">Hover near a mesh corner to snap</div>
          <div className="measurement-heading">
            <span>{points.length === 0 ? 'Pick the first point' : points.length === 1 ? 'Pick the second point' : 'Measurement'}</span>
            {points.length > 0 && <button aria-label="Clear measurement" onClick={onClear}><X size={13} /></button>}
          </div>
          {measurement && (
            <dl>
              <div><dt>Distance</dt><dd>{millimetres(measurement.distance)}</dd></div>
              <div><dt>ΔX</dt><dd>{millimetres(measurement.dx)}</dd></div>
              <div><dt>ΔY</dt><dd>{millimetres(measurement.dy)}</dd></div>
              <div><dt>ΔZ</dt><dd>{millimetres(measurement.dz)}</dd></div>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
