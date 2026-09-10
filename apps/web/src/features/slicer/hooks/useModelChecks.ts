import { useCallback,useEffect,useRef,useState } from 'react';
import type {BufferGeometry} from 'three';
import type {BuildVolume,ConfigBundle,Position,Rotation,Scale,SlicerModel} from '../types';
import {ModelChecksClient} from '../lib/modelChecksClient';
import type {CheckReport,Finding} from '../lib/modelChecks';
const scalar=(value:unknown)=>Array.isArray(value)?value[0]:value;
export function useModelChecks(models:SlicerModel[],positions:Record<string,Position>,rotations:Record<string,Rotation>,scales:Record<string,Scale>,volume:BuildVolume,config:ConfigBundle,overrides:Record<string,Partial<ConfigBundle>>){
 const [reports,setReports]=useState<Record<string,CheckReport>>({});const [active,setActive]=useState<{fileId:string;finding:Finding}|null>(null);
 const geometries=useRef(new Map<string,BufferGeometry>());const client=useRef<ModelChecksClient|null>(null);const [revision,bump]=useState(0);
 useEffect(()=>{const instance=new ModelChecksClient((id,report)=>setReports(current=>({...current,[id]:report})));client.current=instance;geometries.current.forEach((geometry,id)=>instance.register(id,geometry));bump(n=>n+1);return()=>{instance.dispose();client.current=null;};},[]);
 const register=useCallback((id:string,geometry:BufferGeometry)=>{geometries.current.set(id,geometry);client.current?.register(id,geometry);bump(n=>n+1);},[]);
 useEffect(()=>{
  const ids=new Set(models.filter(m=>!m.modifierFor).map(m=>m.fileId));
  for(const id of geometries.current.keys())if(!ids.has(id)){geometries.current.delete(id);client.current?.remove(id);}
  setActive(null);
  const requests=models.filter(m=>!m.modifierFor&&geometries.current.has(m.fileId)).map((m,index)=>{
   const id=m.fileId;const process={...config.process_config,...overrides[id]?.process_config};const machine={...config.machine_config,...overrides[id]?.machine_config};
   const nozzle=Number(scalar(machine.nozzle_diameter));const widthValue=scalar(process.line_width);const width=typeof widthValue==='string'&&widthValue.endsWith('%')?parseFloat(widthValue)*nozzle/100:Number(widthValue);
   return {id,requestId:client.current!.invalidate(id),context:{position:positions[id]??{x:volume.x/2+index*60-((models.length-1)*60)/2,y:volume.y/2},rotation:rotations[id]??{x:0,y:0,z:0},scale:scales[id]??{x:1,y:1,z:1},volume,angle:Number(scalar(process.support_threshold_angle)??0),supportType:String(scalar(process.support_type)??'normal'),width:Number.isFinite(width)&&width>0?width:Number.isFinite(nozzle)&&nozzle>0?nozzle:.4}};
  });
  setReports(Object.fromEntries([...ids].map(id=>[id,{status:'running',findings:[]}])));
  const timer=setTimeout(()=>requests.forEach(r=>client.current?.analyze(r.id,r.requestId,r.context)),180);
  return()=>clearTimeout(timer);
 },[models,positions,rotations,scales,volume,config,overrides,revision]);
 return {reports,active,setActive,register};
}
