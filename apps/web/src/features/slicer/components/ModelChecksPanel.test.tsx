import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModelChecksPanel} from './ModelChecksPanel';
it('labels local advisory checks and selected model without promising printability',()=>{
 const html=renderToStaticMarkup(<ModelChecksPanel models={[{fileId:'a',fileName:'cube.stl'}] as any} reports={{a:{status:'complete',findings:[]}}} selectedFileId="a" active={null} onHighlight={()=>{}} onAction={()=>{}}/>);
 expect(html).toContain('Model checks');expect(html).toContain('No obvious geometry problems found');expect(html).toContain('cube.stl');expect(html).not.toContain('Model is printable');
});
