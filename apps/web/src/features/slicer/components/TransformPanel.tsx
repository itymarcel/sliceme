import { Move3D, Rotate3D } from 'lucide-react';

import type { Position, Rotation } from '../types';

type Props = {
  position: Position;
  rotation: Rotation;
  onPosition: (position: Position) => void;
  onRotation: (rotation: Rotation) => void;
};

export function TransformPanel({ position, rotation, onPosition, onRotation }: Props) {
  const number = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return (
    <div className="transform-panel panel">
      <div className="transform-group"><span><Move3D size={14} /> Position</span>{(['x', 'y'] as const).map((axis) => { const label = `Position ${axis.toUpperCase()}`; const id = `position-${axis}`; return <div className="transform-field" key={axis}><span><label htmlFor={id}>{axis.toUpperCase()}</label></span><input id={id} aria-label={label} type="number" step="0.1" value={position[axis]} onChange={(event) => onPosition({ ...position, [axis]: number(event.target.value) })} /></div>; })}</div>
      <div className="transform-group"><span><Rotate3D size={14} /> Rotation</span>{(['x', 'y', 'z'] as const).map((axis) => { const label = `Rotation ${axis.toUpperCase()}`; const id = `rotation-${axis}`; return <div className="transform-field" key={axis}><span><label htmlFor={id}>{axis.toUpperCase()}</label></span><input id={id} aria-label={label} type="number" step="1" value={rotation[axis]} onChange={(event) => onRotation({ ...rotation, [axis]: number(event.target.value) })} /></div>; })}</div>
    </div>
  );
}
