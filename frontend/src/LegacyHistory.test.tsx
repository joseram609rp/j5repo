// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {LegacyHistory} from './LegacyHistory';
import {api} from './api';
vi.mock('./api',()=>({api:vi.fn()}));
it('only fetches archive GETs on explicit search and detail, preserving missing dates and zero prices',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 vi.mocked(api).mockImplementation(async path=>path.includes('/fixture')?{work:{id:'fixture',plate:'TST123',workDate:null,description:'Fixture repair',price:'0',dateQuality:'missing'},vehicles:[{id:'card',customerName:'Fixture',identification:null,phone:null,make:null,model:null}]} as never:{orders:[{id:'fixture',plate:'TST123',workDate:null,description:'Fixture repair'}],total:1,page:1,pageSize:25} as never);
 try {
  await act(async()=>root.render(<LegacyHistory/>));expect(api).not.toHaveBeenCalled();
  await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(container.textContent).toContain('Sin fecha');
  await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('TST123'))!.click());
  expect(container.textContent).toContain('Importe histórico: 0');expect(container.textContent).toContain('Cédula: Sin dato');
  expect(container.querySelectorAll('article input, article textarea')).toHaveLength(0);
  for(const [path,options] of vi.mocked(api).mock.calls){expect(path).toMatch(/^\/legacy\/work-orders/);expect(options?.method??'GET').toBe('GET');}
 } finally {await act(async()=>root.unmount());container.remove();vi.clearAllMocks();vi.unstubAllGlobals();}
});
