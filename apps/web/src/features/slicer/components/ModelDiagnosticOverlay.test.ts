import {it,expect} from 'vitest';
import {BoxGeometry} from 'three';
import {diagnosticGeometry} from './ModelDiagnosticOverlay';
it('extracts source triangles for indexed and nonindexed meshes and skips invalid IDs',()=>{
 for(const g of [new BoxGeometry(),new BoxGeometry().toNonIndexed()]){
  const overlay=diagnosticGeometry(g,[2,-1,500]);expect(overlay.getAttribute('position').count).toBe(3);
  const source=g.getAttribute('position');expect(overlay.getAttribute('position').getX(0)).toBe(source.getX(g.index?g.index.getX(6):6));
 }
});
