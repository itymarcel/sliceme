import { describe, expect, it } from 'vitest';
import { Parser } from './gcode-preview/gcode-parser';
import { analyzePostSlice, type PostSliceModelBounds } from './postSliceAnalysis';

const bounds = (x: number, y: number, z: number): PostSliceModelBounds => ({
  min: { x: 0, y: 0, z: 0 },
  max: { x, y, z },
});

function analyze(source: string, modelBounds = bounds(20, 20, 20)) {
  const parser = new Parser(0);
  parser.parseGCode(source);
  return analyzePostSlice({
    preamble: parser.preamble,
    layers: parser.layers,
    modelBounds,
    filamentDiameter: 1.75,
    lineWidth: 0.4,
  });
}

describe('post-slice analysis', () => {
  it('uses parsed TYPE tags for long bridges and reports unavailability without them', () => {
    const tagged = analyze(`M83\nG90\nG1 Z0.2 F1200\nG1 X0 Y0 E1 F1200\n;TYPE:Bridge\nG1 Z0.4\nG1 X30 Y0 E2 F1200`);
    expect(tagged.availability.bridgeTags).toBe(true);
    expect(tagged.findings.find((finding) => finding.id === 'long-bridge')).toMatchObject({ layerIndex: 1, severity: 'warning' });
    expect(tagged.findings.find((finding) => finding.id === 'long-bridge')?.explanation).toContain('30.0 mm');

    const untagged = analyze(`M83\nG90\nG1 Z0.2\nG1 X0 Y0 E1 F1200\nG1 Z0.4\nG1 X30 Y0 E2 F1200`);
    expect(untagged.availability.bridgeTags).toBe(false);
    expect(untagged.findings.some((finding) => finding.id === 'long-bridge')).toBe(false);

    const typedWithoutBridge = analyze(`M83\nG90\n;TYPE:Outer wall\nG1 Z0.2\nG1 X0 Y0 E1 F1200\nG1 X10 Y0 E1`);
    expect(typedWithoutBridge.availability.bridgeTags).toBe(true);
    expect(typedWithoutBridge.findings.some((finding) => finding.id === 'long-bridge')).toBe(false);
  });

  it('tracks relative/absolute extrusion, G92, feedrate persistence, G10 and tool changes', () => {
    const report = analyze(`G90\nM82\nG1 Z0.2 F600\nG1 X10 Y0 E1\nG1 E0.2\nG92 E0\nT1\nM83\nG1 X20 Y0 E1 F1200\nG10\nG1 E-0.8\nG1 Z0.4\nG1 X30 Y0 E1`);
    expect(report.metrics.retractions).toBe(3);
    expect(report.metrics.totalExtrusionLength).toBeCloseTo(3, 5);
    expect(report.metrics.layerTimesSeconds[0]).toBeGreaterThan(1);
  });

  it('derives support share, short layer time, extent mismatch, and first-layer material from extrusion moves', () => {
    const report = analyze(`M83\nG90\nG1 Z0.2 F6000\nG1 X2 Y2 E0.2\nG1 X3 Y2 E0.2\nG1 Z0.4\n;TYPE:Support\nG1 X4 Y2 E300 F6000\nG1 Z0.6\n;TYPE:Internal infill\nG1 X5 Y2 E8 F6000`, bounds(100, 100, 20));
    expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'short-layer-time', 'excessive-support', 'printable-extent-mismatch', 'little-first-layer',
    ]));
    expect(report.metrics.supportShare).toBeGreaterThan(0.9);
    expect(report.metrics.firstLayerExtrusionVolume).toBeGreaterThan(0);
  });

  it('flags only conservative tall/narrow bounds and approximates unsupported islands from layer overlap', () => {
    const report = analyze(`M83\nG90\nG1 Z0.2 F1200\nG1 X0 Y0 E1\nG1 X10 Y0 E1\nG1 Z0.4\nG1 X60 Y60 E1\nG1 X70 Y60 E1`, bounds(15, 15, 100));
    expect(report.findings.find((finding) => finding.id === 'tall-narrow')?.explanation).toContain('100.0 mm tall');
    const island = report.findings.find((finding) => finding.id === 'unsupported-island');
    expect(island).toMatchObject({ layerIndex: 1, severity: 'warning' });
    expect(island?.explanation).toContain('toolpath-overlap approximation');
  });

  it('finds a detached unsupported component even when most of the layer is supported', () => {
    const report = analyze(`M83\nG90\nG1 Z0.2 F1200\nG1 X0 Y0 E1\nG1 X100 Y0 E2\nG1 Z0.4\nG0 X0 Y0\nG1 X100 Y0 E2\nG0 X200 Y0\nG1 X220 Y0 E1`);
    expect(report.findings.find((finding) => finding.id === 'unsupported-island')).toMatchObject({ layerIndex: 1 });
  });

  it('detects repeated abrupt speed or extrusion-per-distance changes but ignores travel transitions', () => {
    const lines = ['M83', 'G90', 'G1 Z0.2 F1200', 'G1 X0 Y0 E1'];
    for (let index = 1; index <= 8; index += 1) {
      lines.push(`G1 X${index * 4} Y0 E${index % 2 ? 0.2 : 1.2} F${index % 2 ? 600 : 6000}`);
      lines.push(`G0 X${index * 4} Y2 F12000`);
    }
    const report = analyze(lines.join('\n'));
    expect(report.findings.find((finding) => finding.id === 'abrupt-flow-speed')?.explanation).toMatch(/abrupt transitions/);
  });

  it('routes short-layer and retraction findings to exposed settings', () => {
    const lines = ['M83', 'G90', 'G1 Z0.2 F1200', 'G1 X1 Y0 E1'];
    for (let index = 0; index < 101; index += 1) lines.push('G1 E-0.5 F1200', 'G1 E0.5 F1200');
    const report = analyze(lines.join('\n'));
    const retractions = report.findings.find((finding) => finding.id === 'excessive-retractions');
    expect(retractions?.explanation).toContain('101 retractions');
    expect(retractions?.action).toBe('review-retraction');
    const shortLayer = analyze('M83\nG90\nG1 Z0.2 F6000\nG1 X1 Y0 E1');
    expect(shortLayer.findings.find((finding) => finding.id === 'short-layer-time')?.action).toBe('review-cooling');
  });

  it('bounds raster work for very long segments', () => {
    const report = analyze(`M83\nG90\nG1 Z0.2\nG1 X0 Y0 E1 F1200\nG1 X1000000 Y0 E1`, bounds(20, 20, 20));
    expect(report.metrics.sampleCount).toBeLessThanOrEqual(250_000);
  });
});
