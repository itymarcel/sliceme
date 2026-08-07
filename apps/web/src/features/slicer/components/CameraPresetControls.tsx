import { Focus, Scan } from 'lucide-react';

type Props = { onTop: () => void; onFront: () => void; onRight: () => void; onCenter: () => void };

export function CameraPresetControls(props: Props) {
  return (
    <div className="camera-controls panel">
      <Scan size={14} />
      <button onClick={props.onTop}>Top</button>
      <button onClick={props.onFront}>Front</button>
      <button onClick={props.onRight}>Right</button>
      <button onClick={props.onCenter}><Focus size={13} /> Fit</button>
    </div>
  );
}
