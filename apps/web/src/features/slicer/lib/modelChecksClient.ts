import { BufferGeometry } from 'three';
import type {CheckContext,CheckReport} from './modelChecks';
export class ModelChecksClient {
 private worker:Worker|null=null;private latest=new Map<string,number>();private sequence=0;
 constructor(private receive:(id:string,report:CheckReport)=>void,factory=()=>new Worker(new URL('./modelChecks.worker.ts',import.meta.url),{type:'module'})){
  try{this.worker=factory();this.worker.onmessage=({data})=>{if(this.latest.get(data.fileId)===data.requestId)this.receive(data.fileId,data.report);};this.worker.onerror=()=>{this.worker?.terminate();this.worker=null;for(const id of this.latest.keys())this.receive(id,{status:'failed',findings:[]});};}catch{this.worker=null;}
 }
 register(fileId:string,geometry:BufferGeometry){this.invalidate(fileId);const p=geometry.getAttribute('position');const positions=new Float32Array(p.array);const indices=geometry.index?new Uint32Array(geometry.index.array):null;this.worker?.postMessage({type:'register',fileId,positions,indices},[positions.buffer,...(indices?[indices.buffer]:[])]);}
 invalidate(fileId:string){const requestId=++this.sequence;this.latest.set(fileId,requestId);return requestId;}
 analyze(fileId:string,requestId:number,context:CheckContext){if(this.latest.get(fileId)!==requestId)return;if(!this.worker){this.receive(fileId,{status:'failed',findings:[]});return;}this.worker.postMessage({type:'analyze',fileId,requestId,context});}
 remove(fileId:string){this.latest.delete(fileId);this.worker?.postMessage({type:'remove',fileId});}
 dispose(){this.latest.clear();this.worker?.terminate();this.worker=null;}
}
