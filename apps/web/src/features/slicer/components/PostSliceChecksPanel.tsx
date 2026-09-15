import { useState } from 'react';
import type { PostSliceAction, PostSliceReport } from '../lib/postSliceAnalysis';
import './PostSliceChecksPanel.css';

const actionLabels: Record<Exclude<PostSliceAction, 'layer'>, string> = {
  'review-supports': 'Support settings',
  'review-speed': 'Speed settings',
  'review-cooling': 'Cooling settings',
  'review-retraction': 'Retraction settings',
  'review-adhesion': 'Brim settings',
};

export function PostSliceChecksPanel({ report, onSelectLayer, onAction }: {
  report: PostSliceReport;
  onSelectLayer: (layerIndex: number) => void;
  onAction: (action: Exclude<PostSliceAction, 'layer'>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const warnings = report.findings.filter((finding) => finding.severity !== 'info').length;
  return (
    <section className="post-slice-checks panel" aria-label="Post-slice checks">
      <button className="post-slice-checks-header" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <strong>Post-slice checks</strong><span>{warnings} findings</span><span>{expanded ? '−' : '+'}</span>
      </button>
      <div className="post-slice-checks-body" hidden={!expanded}>
        <p>Local toolpath advice from this G-code · results are conservative indicators, not guarantees.</p>
        {!report.availability.bridgeTags && <p className="post-slice-unavailable">Bridge length unavailable: no Orca <code>TYPE:Bridge</code> tags were parsed.</p>}
        {!report.findings.length && <p>No configured thresholds were exceeded.</p>}
        {report.findings.map((finding) => (
          <div className="post-slice-card" data-severity={finding.severity} key={finding.id}>
            <button
              className="post-slice-finding"
              type="button"
              aria-label={`${finding.title}${finding.layerIndex === undefined ? '' : `, show layer ${finding.layerIndex + 1}`}`}
              onClick={() => finding.layerIndex === undefined ? undefined : onSelectLayer(finding.layerIndex)}
              disabled={finding.layerIndex === undefined}
            >
              <span>{finding.severity} · {finding.title}{finding.layerIndex === undefined ? '' : ` · L${finding.layerIndex + 1}`}</span>
              <small>{finding.explanation}</small>
            </button>
            {finding.action !== 'layer' && <button className="post-slice-action" type="button" onClick={() => onAction(finding.action as Exclude<PostSliceAction, 'layer'>)}>{actionLabels[finding.action]}</button>}
          </div>
        ))}
      </div>
    </section>
  );
}
