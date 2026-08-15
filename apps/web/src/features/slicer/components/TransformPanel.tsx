import { Move3D, Rotate3D } from 'lucide-react';

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
      <div className="transform-group">
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
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => onRotation({ ...rotation, [axis]: number(event.target.value) })}
              />
            </div>
          );
        })}
        <div className="quick-rotate">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              className="quick-rotate-button"
              aria-label={`Rotate ${axis.toUpperCase()} by 45 degrees`}
              onClick={() => onRotation({ ...rotation, [axis]: wrapDegrees(rotation[axis] + 45) })}
            >
              {axis.toUpperCase()}+45°
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
