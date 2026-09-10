import { BufferGeometry, Euler, Matrix4, Vector3 } from 'three';
export type ModelTransform = { position: { x: number; y: number; z?: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } };
/** Centered source, local scale then XYZ Euler, exact vertex grounding, then explicit world Z.
 * Matches engine.py's vertex-min grounding; do not ground the analysis a second time. */
export function modelWorldMatrix(geometry: BufferGeometry, transform: ModelTransform): Matrix4 {
 const {rotation:r, scale:s, position:p} = transform;
 const matrix = new Matrix4().makeRotationFromEuler(new Euler(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180)).scale(new Vector3(s.x,s.y,s.z));
 const positions = geometry.getAttribute('position'); const point = new Vector3(); let minZ = Infinity;
 for(let i=0;i<positions.count;i++) minZ=Math.min(minZ,point.fromBufferAttribute(positions,i).applyMatrix4(matrix).z);
 matrix.setPosition(p.x,p.y,(p.z??0)-(Number.isFinite(minZ)?minZ:0));
 return matrix;
}
