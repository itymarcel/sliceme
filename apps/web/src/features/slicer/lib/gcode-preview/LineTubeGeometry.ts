import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Vector3,
} from 'three';
import { LinePoint } from './LinePoint';

interface PointData {
  pointNr: number;
  radialNr: number;
  vertices: number[];
  normals: number[];
  colors: number[];
}

/**
 * Tube geometry that draws each GCode move as a 3D tube with physically-based
 * radius derived from extrusion amount. Ported from github.com/aligator/gcode-viewer.
 *
 * Unlike TubeGeometry, each point is placed exactly on the toolpath without
 * re-calculating a curve. Supports per-vertex colors for colorization modes.
 */
export class LineTubeGeometry extends BufferGeometry {
  private pointsBuffer: LinePoint[] = [];
  private pointsLength: number;
  private readonly radialSegments: number;

  private vertices: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private indices: number[] = [];
  private segmentsRadialNumbers: number[] = [];

  constructor(radialSegments = 8) {
    super();
    // @ts-ignore
    this.type = 'LineTubeGeometry';
    this.pointsLength = 0;
    this.radialSegments = radialSegments;
  }

  dispose() {
    super.dispose();
    this.pointsBuffer = [];
    this.normals = [];
    this.vertices = [];
    this.colors = [];
    this.uvs = [];
    this.indices = [];
    this.segmentsRadialNumbers = [];
  }

  public add(point: LinePoint) {
    this.pointsLength++;
    this.pointsBuffer.push(point);
    if (this.pointsBuffer.length === 3) {
      this.generateSegment(0);
    } else if (this.pointsBuffer.length >= 4) {
      this.generateSegment(1);
    }
  }

  public finish() {
    if (this.pointsBuffer.length === 2) {
      this.generateSegment(0);
    } else {
      this.generateSegment(1);
    }

    this.setAttribute('position', new Float32BufferAttribute(this.vertices, 3));
    this.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    this.setAttribute('color', new Float32BufferAttribute(this.colors, 3));

    this.generateUVs();
    this.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));

    this.generateIndices();
    this.setIndex(this.indices);

    this.segmentsRadialNumbers = [];
    this.normals = [];
    this.colors = [];
    this.uvs = [];
  }

  public pointsCount(): number {
    return this.pointsLength;
  }

  private generateSegment(i: number) {
    const prevPoint = this.pointsBuffer[i - 1];
    const point = this.pointsBuffer[i];
    const nextPoint = this.pointsBuffer[i + 1];
    const nextNextPoint = this.pointsBuffer[i + 2];

    if (nextPoint === undefined) return;

    const frame = this.computeFrenetFrames([point.point, nextPoint.point], false);
    const lastRadius = this.pointsBuffer[i - 1]?.radius || 0;

    function createPointData(
      pointNr: number,
      radialNr: number,
      normal: Vector3,
      pt: Vector3,
      radius: number,
      color: Color,
    ): PointData {
      return {
        pointNr,
        radialNr,
        normals: [normal.x, normal.y, normal.z],
        vertices: [
          pt.x + radius * normal.x,
          pt.y + radius * normal.y,
          pt.z + radius * normal.z,
        ],
        colors: color.toArray(),
      };
    }

    const segmentsPoints: PointData[][] = [[], [], [], []];

    for (let j = 0; j <= this.radialSegments; j++) {
      const v = (j / this.radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);

      const normal = new Vector3();
      normal.x = cos * frame.normals[0].x + sin * frame.binormals[0].x;
      normal.y = cos * frame.normals[0].y + sin * frame.binormals[0].y;
      normal.z = cos * frame.normals[0].z + sin * frame.binormals[0].z;
      normal.normalize();

      if (prevPoint === undefined) {
        segmentsPoints[0].push(createPointData(i, j, normal, point.point, lastRadius, point.color));
      }

      segmentsPoints[1].push(createPointData(i, j, normal, point.point, point.radius, point.color));
      segmentsPoints[2].push(createPointData(i, j, normal, nextPoint.point, point.radius, point.color));

      if (nextNextPoint === undefined) {
        segmentsPoints[3].push(createPointData(i + 1, j, normal, nextPoint.point, 0, point.color));
      }
    }

    segmentsPoints.forEach((p) => {
      p.forEach((pp) => {
        this.normals.push(...pp.normals);
        this.vertices.push(...pp.vertices);
        this.colors.push(...pp.colors);
      });
      this.segmentsRadialNumbers.push(...p.map((cur) => cur.radialNr));
    });

    if (this.pointsBuffer.length >= 4) {
      this.pointsBuffer = this.pointsBuffer.slice(1);
    }
  }

  private generateIndices() {
    for (let i = this.radialSegments + 2; i < this.segmentsRadialNumbers.length; i++) {
      const a = i - 1;
      const b = i - this.radialSegments - 2;
      const c = i - this.radialSegments - 1;
      const d = i;
      this.indices.push(a, b, c, d, a, c);
    }
  }

  private generateUVs() {
    for (let i = 0; i < this.segmentsRadialNumbers.length; i++) {
      this.uvs.push(
        i / this.radialSegments - 1,
        this.segmentsRadialNumbers[i] / this.radialSegments,
      );
    }
  }

  private getTangent(point1: Vector3, point2: Vector3, optionalTarget?: Vector3) {
    const tangent = optionalTarget || new Vector3();
    tangent.copy(point1).sub(point2).normalize();
    return tangent;
  }

  private computeFrenetFrames(points: Vector3[], closed: boolean) {
    const normal = new Vector3();
    const tangents: Vector3[] = [];
    const normals: Vector3[] = [];
    const binormals: Vector3[] = [];

    const vec = new Vector3();
    const mat = new Matrix4();

    for (
      let i = 1;
      i < Math.floor(points.length / 2) + (points.length % 2 ? 0 : 1);
      i++
    ) {
      const t = this.getTangent(points[i - 1], points[i]);
      t.normalize();
      tangents.push(t);
    }

    const segments = tangents.length - 1;

    normals[0] = new Vector3();
    binormals[0] = new Vector3();
    let min = Number.MAX_VALUE;
    const tx = Math.abs(tangents[0].x);
    const ty = Math.abs(tangents[0].y);
    const tz = Math.abs(tangents[0].z);

    if (tx <= min) { min = tx; normal.set(1, 0, 0); }
    if (ty <= min) { min = ty; normal.set(0, 1, 0); }
    if (tz <= min) { normal.set(0, 0, 1); }

    vec.crossVectors(tangents[0], normal).normalize();
    normals[0].crossVectors(tangents[0], vec);
    binormals[0].crossVectors(tangents[0], normals[0]);

    for (let i = 1; i <= segments; i++) {
      normals[i] = normals[i - 1].clone();
      binormals[i] = binormals[i - 1].clone();

      vec.crossVectors(tangents[i - 1], tangents[i]);

      if (vec.length() > Number.EPSILON) {
        vec.normalize();
        const theta = Math.acos(MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normals[i].applyMatrix4(mat.makeRotationAxis(vec, theta));
      }

      binormals[i].crossVectors(tangents[i], normals[i]);
    }

    if (closed === true) {
      let theta = Math.acos(MathUtils.clamp(normals[0].dot(normals[segments]), -1, 1));
      theta /= segments;

      if (tangents[0].dot(vec.crossVectors(normals[0], normals[segments])) > 0) {
        theta = -theta;
      }

      for (let i = 1; i <= segments; i++) {
        normals[i].applyMatrix4(mat.makeRotationAxis(tangents[i], theta * i));
        binormals[i].crossVectors(tangents[i], normals[i]);
      }
    }

    return { tangents, normals, binormals };
  }
}
