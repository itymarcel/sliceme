import { Move3D, Rotate3D, RotateCw } from 'lucide-react';

import { useState } from 'react';

import type { Position, Rotation } from '../types';

type Props = {
  position: Position;
  rotation: Rotation;
  onPosition: (position: Position) => void;
  onRotation: (rotation: Rotation) => void;
};

const wrapDegrees = (value: number) => ((value % 360) + 360) % 360;
const number = (value: string) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function TransformPanel({ position, rotation, onPosition, onRotation }: Props) {
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
    </div>
  );
}
