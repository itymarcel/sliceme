import { BufferGeometry, DoubleSide, Matrix3, Matrix4, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Triangle } from './meshTopology';
/** BVH indirect mode leaves source triangle order intact, including returned faceIndex. */
export function createThicknessIndex(geometry:BufferGeometry) {
 // Installed runtime supports indirect; its bundled legacy declaration omits it.
 const options = { indirect:true, maxLeafTris:10 };
 return new MeshBVH(geometry,options);
}
export function estimateFeatures(bvh:MeshBVH, triangles:Triangle[], matrix:Matrix4, width:number) {
 const inverse=matrix.clone().invert(), normals=new Matrix3().getNormalMatrix(matrix);
 const areas=triangles.map(t=>{const [a,b,c]=t.map(p=>p.clone().applyMatrix4(matrix));return b.sub(a).cross(c.sub(a)).length()/2;});
 const total=areas.reduce((a,b)=>a+b,0); const count=Math.min(512,triangles.length); const selected=new Set<number>();
 let cumulative=0,cursor=0; for(let i=0;i<areas.length;i++){cumulative+=areas[i];while(cursor<count&&(cursor+.5)*total/count<=cumulative){selected.add(i);cursor++;}}
 const thin:number[]=[]; let minimum=Infinity;let samples=0;
 for(const i of selected){
  const t=triangles[i]; const outward=new Vector3().subVectors(t[1],t[0]).cross(new Vector3().subVectors(t[2],t[0])).applyMatrix3(normals).normalize();
  // Nozzle width constrains XY features, not a thin horizontal layer in Z.
  // Restrict this conservative estimate to near-vertical walls and sample in XY.
  if(Math.abs(outward.z)>.3)continue;
  outward.z=0;outward.normalize();
  let agreed=0;let localMin=Infinity;
  for(const weights of [[1/3,1/3,1/3],[.4,.3,.3],[.3,.4,.3]]){
   samples++;const world=new Vector3();t.forEach((p,k)=>world.addScaledVector(p,weights[k]));world.applyMatrix4(matrix);
   const epsilon=Math.min(.001,width*.005);const origin=world.clone().addScaledVector(outward,-epsilon);
   const ray=new Ray(origin.clone().applyMatrix4(inverse),outward.clone().negate().transformDirection(inverse));
   const hit=bvh.raycastFirst(ray,DoubleSide); if(!hit||hit.faceIndex===undefined||hit.faceIndex===i)continue;
   const opposite=triangles[hit.faceIndex]; if(!opposite)continue;
   const n=new Vector3().subVectors(opposite[1],opposite[0]).cross(new Vector3().subVectors(opposite[2],opposite[0])).applyMatrix3(normals).normalize();
   const distance=hit.point.clone().applyMatrix4(matrix).distanceTo(world);
   if(n.dot(outward)<-.8&&distance>epsilon*2&&distance<width*.95){agreed++;localMin=Math.min(localMin,distance);}
  }
  if(agreed===3){thin.push(i);minimum=Math.min(minimum,localMin);}
 }
 return {triangles:thin.length>=2?thin:[],minimum,samples};
}
