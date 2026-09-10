import { BufferAttribute, BufferGeometry } from 'three';
import {prepareModel,analyzeModel} from './modelChecks';
const models=new Map<string,ReturnType<typeof prepareModel>>();
self.onmessage=({data})=>{
 const {type,fileId}=data;
 if(type==='remove'){models.get(fileId)?.geometry.dispose();models.delete(fileId);return;}
 try{
  if(type==='register'){
   models.get(fileId)?.geometry.dispose();models.delete(fileId);
   const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(data.positions,3));if(data.indices)geometry.setIndex(new BufferAttribute(data.indices,1));
   models.set(fileId,prepareModel(geometry));return;
  }
  const model=models.get(fileId);if(!model)throw new Error('Geometry unavailable');
  self.postMessage({fileId,requestId:data.requestId,report:analyzeModel(model,data.context)});
 }catch{if(type==='analyze')self.postMessage({fileId,requestId:data.requestId,report:{status:'failed',findings:[]}});}
};
