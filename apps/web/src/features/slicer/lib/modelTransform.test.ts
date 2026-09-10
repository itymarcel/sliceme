import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {BufferAttribute,BufferGeometry,Vector3} from 'three';
import {modelWorldMatrix} from './modelTransform';
import {finalizeGeneratedGeometry} from './meshOperations';
it('matches real engine affine export and generated mesh with XYZ rotation, mirrors, nonuniform scale and explicit Z',()=>{
 const vertices=[[0,0,0],[10,0,0],[0,20,0],[0,0,30]];
 const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(vertices.flat()),3));g.center();
 const transform={position:{x:70,y:80,z:3},rotation:{x:34,y:23,z:17},scale:{x:-2,y:.7,z:1.3}};
 const source=readFileSync('../../services/slicer/app/engine.py','utf8');
 const script=`import ast,json,math,sys\ns=ast.parse(sys.stdin.read())\nf=next(n for n in s.body if isinstance(n,ast.FunctionDef) and n.name=='_build_affine_from_item_transform')\nexec(compile(ast.Module(body=[f],type_ignores=[]),'engine.py','exec'))\nprint(json.dumps(_build_affine_from_item_transform(${JSON.stringify(transform)},${JSON.stringify(vertices)},(0,0))))`;
 const affine=JSON.parse(execFileSync('python3',['-c',script],{input:source,encoding:'utf8'}));
 const matrix=modelWorldMatrix(g,transform);const p=g.getAttribute('position');
 vertices.forEach((v,i)=>{const actual=new Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix);const expected=[0,1,2].map(a=>v[0]*affine[a]+v[1]*affine[3+a]+v[2]*affine[6+a]+affine[9+a]);expect(actual.toArray()).toEqual(expect.arrayContaining(expected.map(x=>expect.closeTo(x,5))));});
});
