import { Box3, BufferGeometry, Matrix3, Vector3 } from 'three';
import { modelWorldMatrix, type ModelTransform } from './modelTransform';
import { createThicknessIndex, estimateFeatures } from './featureThickness';
import { trianglesFromGeometry, vertexKey, edgeKey, EPSILON } from './meshTopology';
export type CheckContext = ModelTransform & {volume:{x:number;y:number;z:number}; angle:number; supportType:string; width:number};
export type Finding = {id:string; severity:'error'|'warning'|'info'; title:string; explanation:string; triangles:number[]; action:'select'|'choose-base'|'repair'|'review-supports'|'review-line-width'};
export type CheckReport = {findings:Finding[]; status:'complete'|'failed'|'running'; durationMs?:number};
const normal = (t:Vector3[]) => new Vector3().subVectors(t[1],t[0]).cross(new Vector3().subVectors(t[2],t[0]));
export function prepareModel(geometry:BufferGeometry) {
 const triangles=trianglesFromGeometry(geometry); const edges=new Map<string,number[]>(); const seen=new Set<string>();
 const degenerate:number[]=[], duplicate:number[]=[];
 triangles.forEach((t,i)=>{
  if(t.some(p=>![p.x,p.y,p.z].every(Number.isFinite))) throw new Error('Non-finite mesh');
  if(normal(t).lengthSq()<=EPSILON*EPSILON) degenerate.push(i);
  const key=t.map(vertexKey).sort().join('|'); if(seen.has(key))duplicate.push(i); seen.add(key);
  for(let j=0;j<3;j++){const key=edgeKey(t[j],t[(j+1)%3]); const owners=edges.get(key); if(owners)owners.push(i);else edges.set(key,[i]);}
 });
 const valid=!degenerate.length&&!duplicate.length&&[...edges.values()].every(o=>o.length===2);
 return {geometry,triangles,edges,degenerate,duplicate,bvh:valid?createThicknessIndex(geometry):null};
}
export function analyzeModel(model:ReturnType<typeof prepareModel>, context:CheckContext):CheckReport {
 const start=performance.now(); const findings:Finding[]=[];
 const add=(id:string,severity:Finding['severity'],title:string,explanation:string,triangles:number[],action:Finding['action'])=>findings.push({id,severity,title,explanation,triangles,action});
 const matrix=modelWorldMatrix(model.geometry,context); const normals=new Matrix3().getNormalMatrix(matrix);
 const world=model.triangles.map(t=>t.map(p=>p.clone().applyMatrix4(matrix))); const bounds=new Box3(); world.forEach(t=>t.forEach(p=>bounds.expandByPoint(p)));
 for(const axis of ['x','y','z'] as const){const excess=Math.max(0,-bounds.min[axis],bounds.max[axis]-context.volume[axis]);if(excess>0.001)add('fit-'+axis,'error','Outside build volume · '+axis.toUpperCase(),`${excess.toFixed(2)} mm beyond ${axis.toUpperCase()} limits (0–${context.volume[axis]} mm).`,[],'select');}
 const boundary=[...model.edges.values()].filter(o=>o.length===1); const nonmanifold=[...model.edges.values()].filter(o=>o.length>2);
 for(const [id,title,list,count] of [['degenerate','Degenerate triangles',model.degenerate,model.degenerate.length],['duplicate','Duplicate triangles',model.duplicate,model.duplicate.length],['boundary','Open boundary edges',boundary.flat(),boundary.length],['nonmanifold','Non-manifold edges',nonmanifold.flat(),nonmanifold.length]] as const){if(count)add(id,'warning',title,`${count} detected; repair may change geometry.`,[...new Set(list)],'repair');}
 const adjacency=Array.from({length:world.length},()=>[] as number[]); model.edges.forEach(o=>{for(let i=1;i<o.length;i++){adjacency[o[0]].push(o[i]);adjacency[o[i]].push(o[0]);}});
 const visited=new Set<number>(); let shells=0;
 world.forEach((_,i)=>{if(visited.has(i))return;shells++;const stack=[i];visited.add(i);while(stack.length){const n=stack.pop()!;adjacency[n].forEach(j=>{if(!visited.has(j)){visited.add(j);stack.push(j);}});}});
 if(shells>1)add('shells','info','Disconnected shells',`${shells} separate shells; these may be intentional.`,[],'select');
 let contactArea=0;const contact:number[]=[];
 world.forEach((t,i)=>{if(t.every(p=>Math.abs(p.z)<=0.02)&&normal(model.triangles[i]).applyMatrix3(normals).normalize().z<-.01){contact.push(i);contactArea+=normal(t).length()/2;}});
 const size=bounds.getSize(new Vector3());
 if(bounds.min.z>0.02||contactArea<Math.max(0.1,size.x*size.y*0.005))add('contact','warning','Limited bed contact',`${contactArea.toFixed(2)} mm² flat contact; lowest point ${bounds.min.z.toFixed(2)} mm above bed. Point/edge contact and adhesion need review.`,contact,'choose-base');
 if(boundary.length||nonmanifold.length||model.degenerate.length||model.duplicate.length)add('thickness-unavailable','info','Feature estimate unavailable','Requires a closed, non-degenerate manifold mesh; repair first. No printability guarantee.',[],'repair');
 const angle=context.angle===0?(context.supportType.includes('tree')?30:null):context.angle;
 if(angle===null)add('overhang-automatic','info','Automatic support threshold','Normal support uses overlap at 0°; an angle-only estimate is unavailable. Orca decides supports.',[],'review-supports');
 else {
  const affected:number[]=[];let area=0,total=0;const onBed=new Set(contact);
  world.forEach((t,i)=>{const a=normal(t).length()/2;total+=a;const z=normal(model.triangles[i]).applyMatrix3(normals).normalize().z;
   const slope=Math.acos(Math.min(1,Math.max(0,-z)))*180/Math.PI;
   if(z<0&&!onBed.has(i)&&slope<angle-1e-7){affected.push(i);area+=a;}
  });
  if(area>.01)add('overhang','warning','Overhang estimate',`${area.toFixed(1)} mm² (${(100*area/total).toFixed(1)}%) below ${angle}° slope from horizontal. Excludes bed faces; bridging and support overlap are not evaluated.`,affected,'review-supports');
 }
 if(model.bvh&&Number.isFinite(context.width)&&context.width>0){const estimate=estimateFeatures(model.bvh,model.triangles,matrix,context.width);if(estimate.triangles.length)add('thin','warning','Thin-feature estimate',`Opposing-surface samples as low as ${estimate.minimum.toFixed(3)} mm vs ${context.width.toFixed(3)} mm reference width. Sparse XY estimate for near-vertical walls only; cavities, slopes and unsampled features can mislead.`,estimate.triangles,'review-line-width');}
 return {status:'complete',findings:findings.sort((a,b)=>({error:0,warning:1,info:2}[a.severity]-{error:0,warning:1,info:2}[b.severity])),durationMs:performance.now()-start};
}
