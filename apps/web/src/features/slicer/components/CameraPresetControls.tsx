import { Focus, Scan, Sun } from 'lucide-react';

type Props = {
  expanded: boolean;
  viewerLabel: string;
  xray?: boolean;
  onToggleXray?: () => void;
  onToggleExpanded: () => void;
  onTop: () => void;
  onFront: () => void;
  onRight: () => void;
  onCenter: () => void;
};

export function CameraPresetControls(props: Props) {
  return (
    <div className="camera-controls panel">
      <button className="camera-fullscreen" type="button" aria-label={props.expanded ? `Exit expanded ${props.viewerLabel} viewer` : `Expand ${props.viewerLabel} viewer`} aria-pressed={props.expanded} onClick={props.onToggleExpanded}><Scan size={14} /></button>
      {props.onToggleXray && (
        <button
          className="camera-xray"
          type="button"
          aria-label={props.xray ? 'Disable X-Ray model inspection' : 'Enable X-Ray model inspection'}
          aria-pressed={!!props.xray}
          onClick={props.onToggleXray}
        ><Sun size={13} /> X-Ray</button>
      )}
      <button className="camera-preset" onClick={props.onTop}>Top</button>
      <button className="camera-preset" onClick={props.onFront}>Front</button>
      <button className="camera-preset" onClick={props.onRight}>Right</button>
      <button className="camera-preset" onClick={props.onCenter}><Focus size={13} /> Fit</button>
    </div>
  );
}
