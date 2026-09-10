import {useMemo,useEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {BufferAttribute,BufferGeometry,DoubleSide} from 'three';
import type {Finding} from '../lib/modelChecks';
export function diagnosticGeometry(source:BufferGeometry,triangles:number[]) {
 const positions=source.getAttribute('position');const index=source.index;const count=(index?.count??positions.count)/3;const values:number[]=[];
 for(const face of triangles){if(!Number.isInteger(face)||face<0||face>=count)continue;for(let j=0;j<3;j++){const i=index?index.getX(face*3+j):face*3+j;values.push(positions.getX(i),positions.getY(i),positions.getZ(i));}}
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(values),3));return geometry;
}
export function ModelDiagnosticOverlay({source,finding}:{source:BufferGeometry;finding:Finding}){
 const {invalidate}=useThree();const whole=finding.id.startsWith('fit-');
 const geometry=useMemo(()=>whole?null:diagnosticGeometry(source,finding.triangles),[source,finding,whole]);
 useEffect(()=>{invalidate();return()=>{geometry?.dispose();invalidate();};},[geometry,invalidate]);
 return <mesh name="model-diagnostic-highlight" userData={{finding:finding.id,triangleCount:whole?'whole':finding.triangles.length}} geometry={geometry??source} raycast={()=>null} renderOrder={16}>
  <meshBasicMaterial color={finding.severity==='error'?'#ef6b73':finding.severity==='warning'?'#fbbf24':'#59d8ff'} side={DoubleSide} transparent opacity={.5} depthWrite={false} polygonOffset polygonOffsetFactor={-3}/>
 </mesh>;
}
