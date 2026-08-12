export type MeasurementPoint = {
  x: number;
  y: number;
  z: number;
};

export type Measurement = {
  distance: number;
  dx: number;
  dy: number;
  dz: number;
};

export type SnapCandidate = {
  point: MeasurementPoint;
  screenX: number;
  screenY: number;
};

export function measurementBetween(start: MeasurementPoint, end: MeasurementPoint): Measurement {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  return {
    distance: Math.hypot(dx, dy, dz),
    dx,
    dy,
    dz,
  };
}

export function addMeasurementPoint(
  points: MeasurementPoint[],
  point: MeasurementPoint,
): MeasurementPoint[] {
  return points.length >= 2 ? [point] : [...points, point];
}

export function closestSnapCandidate(
  candidates: SnapCandidate[],
  screenX: number,
  screenY: number,
  radius: number,
): SnapCandidate | null {
  let closest: SnapCandidate | null = null;
  let closestDistanceSquared = radius * radius;
  for (const candidate of candidates) {
    const dx = candidate.screenX - screenX;
    const dy = candidate.screenY - screenY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared <= closestDistanceSquared) {
      closest = candidate;
      closestDistanceSquared = distanceSquared;
    }
  }
  return closest;
}
