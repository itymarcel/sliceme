import {it,expect,vi} from 'vitest';
import { BoxGeometry } from 'three';
import { ModelChecksClient } from './modelChecksClient';
it('invalidates replies immediately on new context and removes deleted geometry',()=>{
 const worker={postMessage:vi.fn(),terminate:vi.fn(),onmessage:null as any,onerror:null as any};const receive=vi.fn();
 const client=new ModelChecksClient(receive,()=>worker as any);
 client.register('a',new BoxGeometry());const first=client.invalidate('a');const second=client.invalidate('a');
 worker.onmessage({data:{fileId:'a',requestId:first,report:{status:'complete',findings:[]}}});expect(receive).not.toHaveBeenCalled();
 worker.onmessage({data:{fileId:'a',requestId:second,report:{status:'complete',findings:[]}}});expect(receive).toHaveBeenCalledTimes(1);
 client.remove('a');worker.onmessage({data:{fileId:'a',requestId:second,report:{status:'complete',findings:[]}}});expect(receive).toHaveBeenCalledTimes(1);
 expect(worker.postMessage).toHaveBeenLastCalledWith({type:'remove',fileId:'a'});client.dispose();expect(worker.terminate).toHaveBeenCalled();
});
