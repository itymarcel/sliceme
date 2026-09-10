import { describe, it, expect } from 'vitest';
import { BoxGeometry, TetrahedronGeometry, Vector3 } from 'three';
import { modelWorldMatrix } from './modelTransform';
import { analyzeModel, prepareModel } from './modelChecks';
const context = { position: { x: 50, y: 50, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, volume: { x: 100, y: 100, z: 100 }, angle: 45, supportType: 'normal', width: 0.4 };
describe('model checks', () => {
 it('grounds actual vertices rather than rotated bounding-box corners and preserves user Z', () => {
  const g = new TetrahedronGeometry(10); g.center();
  const c = { ...context, rotation: { x: 34, y: 23, z: 17 }, position: { x: 50, y: 50, z: 3 } };
  const m = modelWorldMatrix(g, c); const p = g.getAttribute('position');
  expect(Math.min(...Array.from({length:p.count},(_,i)=>new Vector3().fromBufferAttribute(p,i).applyMatrix4(m).z))).toBeCloseTo(3);
 });
 it('detects exact excess and floating contact without re-grounding', () => {
  const r=analyzeModel(prepareModel(new BoxGeometry(20,20,20)),{...context,position:{x:95,y:50,z:4}});
  expect(r.findings.find(f=>f.id==='fit-x')?.explanation).toContain('5.00 mm');
  expect(r.findings.find(f=>f.id==='contact')?.explanation).toContain('4.00 mm');
 });
 it('reports open boundaries and makes thickness unavailable', () => {
  const g=new BoxGeometry(20,20,20).toNonIndexed(); g.setDrawRange(0,30); g.setAttribute('position',g.getAttribute('position').clone());
  const p=g.getAttribute('position'); g.setAttribute('position',new (p.constructor as any)(p.array.slice(0,90),3));
  const r=analyzeModel(prepareModel(g),context);
  expect(r.findings.some(f=>f.id==='boundary')).toBe(true);
  expect(r.findings.find(f=>f.id==='thickness-unavailable')).toBeTruthy();
 });
 it('estimates elevated overhangs with slope-from-horizontal convention and zero automatic semantics', () => {
  const m=prepareModel(new BoxGeometry(20,20,20)); const c={...context,position:{x:50,y:50,z:5}};
  expect(analyzeModel(m,c).findings.find(f=>f.id==='overhang')?.triangles.length).toBe(2);
  expect(analyzeModel(m,{...c,angle:0}).findings.some(f=>f.id==='overhang-automatic')).toBe(true);
  expect(analyzeModel(m,{...c,angle:0,supportType:'tree(auto)'}).findings.some(f=>f.id==='overhang')).toBe(true);
  expect(analyzeModel(m,{...c,scale:{x:-1,y:2,z:1}}).findings.find(f=>f.id==='overhang')?.triangles).toEqual(analyzeModel(m,c).findings.find(f=>f.id==='overhang')?.triangles);
 });
 it('estimates thin opposing surfaces, never tessellation edges, without mutating source indices', () => {
  const g=new BoxGeometry(.2,20,20,1,10,10); const indices=Array.from(g.index!.array); const m=prepareModel(g);
  const r=analyzeModel(m,context); expect(r.findings.some(f=>f.id==='thin')).toBe(true);
  expect(analyzeModel(m,{...context,width:.1}).findings.some(f=>f.id==='thin')).toBe(false);
  expect(Array.from(g.index!.array)).toEqual(indices);
  expect(analyzeModel(prepareModel(new BoxGeometry(20,20,20,20,20,20)),context).findings.some(f=>f.id==='thin')).toBe(false);
 });
 it('does not treat a thin horizontal layer as a nozzle-width problem', () => {
  expect(analyzeModel(prepareModel(new BoxGeometry(20,20,.2)),context).findings.some(f=>f.id==='thin')).toBe(false);
 });
 it('reports a clean closed cube without claiming printability', () => {
  const r = analyzeModel(prepareModel(new BoxGeometry(20,20,20)), context);
  expect(r.findings).toEqual([]);
 });
});
