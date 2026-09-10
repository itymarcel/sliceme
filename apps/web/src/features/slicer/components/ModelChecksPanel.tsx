import {useEffect,useRef,useState} from 'react';
import type {SlicerModel} from '../types';
import type {CheckReport,Finding} from '../lib/modelChecks';
import './ModelChecksPanel.css';
const actions={select:'Select model','choose-base':'Choose base surface',repair:'Repair model','review-supports':'Review supports','review-line-width':'Review line width'};
export function ModelChecksPanel({models,reports,selectedFileId,active,onHighlight,onAction}:{models:SlicerModel[];reports:Record<string,CheckReport>;selectedFileId?:string;active:{fileId:string;finding:Finding}|null;onHighlight:(value:{fileId:string;finding:Finding}|null)=>void;onAction:(id:string,action:Finding['action'])=>void}){
 const [expanded,setExpanded]=useState(false);const focus=useRef<HTMLButtonElement|null>(null);
 const visible=models.filter(m=>!m.modifierFor&&(!selectedFileId||m.fileId===selectedFileId));const findings=visible.flatMap(m=>reports[m.fileId]?.findings??[]);const running=visible.some(m=>!reports[m.fileId]||reports[m.fileId].status==='running');const errors=findings.filter(f=>f.severity==='error').length;
 useEffect(()=>{if(errors)setExpanded(true);},[errors]);
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if(e.key==='Escape'&&active){onHighlight(null);focus.current?.focus();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[active,onHighlight]);
 return <section className="model-checks" aria-label="Model checks">
  <button className="model-checks-header" aria-expanded={expanded} onClick={()=>{setExpanded(v=>!v);if(expanded)onHighlight(null);}}><strong>Model checks</strong><span aria-live="polite">{running?'Checking…':`${findings.filter(f=>f.severity!=='info').length} findings`}</span><span>{expanded?'−':'+'}</span></button>
  <div className="model-checks-body" hidden={!expanded}>
   <p>Local geometry advice · not a printability guarantee. Modifier meshes and height-range settings excluded.</p>
   {!visible.length&&<p>Select a printable object or Scene.</p>}
   {visible.map(m=><div key={m.fileId} className="model-checks-group"><strong title={m.fileName}>{m.fileName}</strong>
    {!reports[m.fileId]||reports[m.fileId].status==='running'?<p>Checking…</p>:reports[m.fileId].status==='failed'?<p>Analysis unavailable. Viewing and slicing still work.</p>:<>
     {!reports[m.fileId].findings.some(f=>f.severity!=='info')&&<p>No obvious geometry problems found</p>}
     {reports[m.fileId].findings.map(f=><div className="model-check-card" key={f.id} data-severity={f.severity}>
      <button className="model-check-finding" aria-pressed={active?.fileId===m.fileId&&active.finding.id===f.id} onClick={e=>{focus.current=e.currentTarget;onHighlight(active?.fileId===m.fileId&&active.finding.id===f.id?null:{fileId:m.fileId,finding:f});}}><span>{f.severity} · {f.title}</span><small>{f.explanation}</small></button>
      <button className="model-check-action" onClick={()=>onAction(m.fileId,f.action)}>{actions[f.action]}</button>
     </div>)}
    </>}
   </div>)}
  </div>
 </section>;
}
