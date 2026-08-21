import { AlignCenter, Copy, FlipHorizontal2, FlipVertical2, MousePointer2, Move3D, Rotate3D, RotateCw, Scaling } from 'lucide-react';

import { useState } from 'react';

import type { Position, Rotation, Scale } from '../types';

type Props = {
  position: Position;
  rotation: Rotation;
  scale?: Scale;
  onPosition: (position: Position) => void;
  onRotation: (rotation: Rotation) => void;
  onScale?: (scale: Scale) => void;
  onMirror?: (axis: keyof Scale) => void;
  onDuplicate?: () => void;
  onCenter?: () => void;
  onSelectSurface?: () => void;
  surfaceSelectionActive?: boolean;
};

const wrapDegrees = (value: number) => ((value % 360) + 360) % 360;
const number = (value: string) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function TransformPanel({
  position, rotation, scale = { x: 1, y: 1, z: 1 }, onPosition, onRotation,
  onScale, onMirror, onDuplicate, onCenter, onSelectSurface, surfaceSelectionActive = false,
}: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  return (
    <div className="transform-panel panel">
      <div className="transform-group">
        <span><Move3D size={14} aria-hidden /></span>
        {(['x', 'y'] as const).map((axis) => {
          const label = `Position ${axis.toUpperCase()}`;
          const id = `position-${axis}`;
          return (
            <div className="transform-field" key={axis}>
              <span><label htmlFor={id}>{axis.toUpperCase()}</label></span>
              <input
                id={id}
                aria-label={label}
                type="number"
                step="0.1"
                value={position[axis]}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => onPosition({ ...position, [axis]: number(event.target.value) })}
              />
            </div>
          );
        })}
      </div>
      <div className="transform-group rotation-group">
        <span><Rotate3D size={14} aria-hidden /></span>
        {(['x', 'y', 'z'] as const).map((axis) => {
          const label = `Rotation ${axis.toUpperCase()}`;
          const id = `rotation-${axis}`;
          return (
            <div className="transform-field" key={axis}>
              <span><label htmlFor={id}>{axis.toUpperCase()}</label></span>
              <input
                id={id}
                aria-label={label}
                type="number"
                step="1"
                value={rotation[axis]}
                onFocus={(event) => {
                  setFocused(id);
                  event.currentTarget.select();
                }}
                onBlur={() => setFocused(null)}
                onChange={(event) => onRotation({ ...rotation, [axis]: number(event.target.value) })}
              />
              {focused !== id && (
                <button
                  type="button"
                  className="rotate-overlay"
                  aria-label={`Rotate ${axis.toUpperCase()} clockwise 45 degrees`}
                  title={`Rotate ${axis.toUpperCase()} clockwise`}
                  onClick={() => onRotation({ ...rotation, [axis]: wrapDegrees(rotation[axis] + 45) })}
                >
                  <RotateCw size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {onScale && (
        <div className="transform-group scale-group">
          <span><Scaling size={14} aria-hidden /></span>
          <div className="transform-field scale-field">
            <span><label htmlFor="scale-percent">%</label></span>
            <input
              id="scale-percent"
              aria-label="Scale percent"
              type="number"
              min="1"
              step="1"
              value={Math.round(Math.abs(scale.x) * 100)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const next = Math.max(0.01, number(event.target.value) / 100);
                onScale({ x: Math.sign(scale.x || 1) * next, y: Math.sign(scale.y || 1) * next, z: Math.sign(scale.z || 1) * next });
              }}
            />
          </div>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button key={axis} className="transform-action" type="button" aria-label={`Mirror ${axis.toUpperCase()}`} title={`Mirror ${axis.toUpperCase()}`} onClick={() => onMirror?.(axis)}>
              {axis === 'y' ? <FlipVertical2 size={13} /> : <FlipHorizontal2 size={13} />}<small>{axis.toUpperCase()}</small>
            </button>
          ))}
        </div>
      )}
      {(onDuplicate || onCenter || onSelectSurface) && (
        <div className="object-quick-actions">
          {onDuplicate && <button type="button" aria-label="Duplicate object" onClick={onDuplicate}><Copy size={13} /> Duplicate</button>}
          {onCenter && <button type="button" aria-label="Center object" onClick={onCenter}><AlignCenter size={13} /> Center</button>}
          {onSelectSurface && <button type="button" className={surfaceSelectionActive ? 'active' : undefined} aria-label={surfaceSelectionActive ? 'Cancel flat surface selection' : 'Select flat surface'} aria-pressed={surfaceSelectionActive} onClick={onSelectSurface}><MousePointer2 size={13} /> {surfaceSelectionActive ? 'Cancel' : 'Select flat surface'}</button>}
        </div>
      )}
    </div>
  );
}
