/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostSliceChecksPanel } from './PostSliceChecksPanel';
import type { PostSliceReport } from '../lib/postSliceAnalysis';

const report: PostSliceReport = {
  availability: { bridgeTags: false },
  metrics: {
    totalExtrusionLength: 10, totalExtrusionVolume: 24, supportExtrusionVolume: 0, supportShare: 0,
    retractions: 2, totalTimeSeconds: 20, layerTimesSeconds: [10, 10], firstLayerExtrusionLength: 2,
    firstLayerExtrusionVolume: 4.8, firstLayerDepositedArea: 1.2, printableBounds: null, sampleCount: 4,
  },
  findings: [{
    id: 'unsupported-island', severity: 'warning', title: 'Possible unsupported island',
    explanation: 'Layer 2 has 0% sampled overlap. This is a toolpath-overlap approximation, not geometric certainty.',
    layerIndex: 1, action: 'layer',
  }],
};

describe('PostSliceChecksPanel', () => {
  it('stays compact, explains bridge unavailability, and navigates spatial findings to a layer', () => {
    const onSelectLayer = vi.fn();
    render(<PostSliceChecksPanel report={report} onSelectLayer={onSelectLayer} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Post-slice checks/ }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Post-slice checks/ }));
    expect(screen.getByText(/Bridge length unavailable/)).toBeTruthy();
    expect(screen.getByText(/toolpath-overlap approximation/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Possible unsupported island/ }));
    expect(onSelectLayer).toHaveBeenCalledWith(1);
    expect(document.body.textContent).not.toContain('printable');
  });
});
