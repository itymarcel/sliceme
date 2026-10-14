import type { Color } from 'three';

/**
 * Collects line segments from many G-code moves into flat arrays so the renderer
 * can draw one object per material instead of one object per layer and toolpath type.
 * Positions are xyz triples (two points per segment). Colors are one rgb triple per point.
 */
export class SegmentBatch {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  /**
   * Appends flat xyz points, coloring every point with `color`.
   * Uses index loops rather than spread so very large layers cannot exceed argument limits.
   */
  addSegments(vertices: number[], color: Color): void {
    const { positions, colors } = this;
    for (let i = 0; i < vertices.length; i++) positions.push(vertices[i]);
    const pointCount = vertices.length / 3;
    for (let p = 0; p < pointCount; p++) colors.push(color.r, color.g, color.b);
  }

  clear(): void {
    this.positions.length = 0;
    this.colors.length = 0;
  }
}
