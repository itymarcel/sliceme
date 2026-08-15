import { Focus, Scan } from 'lucide-react';

type Props = { expanded: boolean; viewerLabel: string; onToggleExpanded: () => void; onTop: () => void; onFront: () => void; onRight: () => void; onCenter: () => void };

export function CameraPresetControls(props: Props) {
  return (
    <div className="camera-controls panel">
      <button className="camera-fullscreen" type="button" aria-label={props.expanded ? `Exit expanded ${props.viewerLabel} viewer` : `Expand ${props.viewerLabel} viewer`} aria-pressed={props.expanded} onClick={props.onToggleExpanded}><Scan size={14} /></button>
      <button onClick={props.onTop}>Top</button>
      <button onClick={props.onFront}>Front</button>
      <button onClick={props.onRight}>Right</button>
      <button onClick={props.onCenter}><Focus size={13} /> Fit</button>
    </div>
  );
}
