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

it('restores direct and revisited URLs, retaining filters on pagination with one request per action', async () => {
 const previous = window.location.href;
 const state = window.history.state;
 const container = document.body.appendChild(document.createElement('div'));
 const root = createRoot(container);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.mocked(api).mockImplementation(async path => ({
  orders: [], total: 100, page: Number(new URL(path, window.location.origin).searchParams.get('page')), pageSize: 25,
 }) as never);
 try {
  const plateUrl = '/historial-j5?q=JRP101&from=2024-01-01&to=2026-01-07&pagina=2';
  window.history.replaceState(null, '', plateUrl);
  await act(async () => root.render(<LegacyHistory key="direct" userId="fixture" />));
  expect(api).toHaveBeenCalledExactlyOnceWith('/legacy/work-orders?q=JRP101&from=2024-01-01&to=2026-01-07&page=2&pageSize=25');
  expect(container.querySelector('input')?.value).toBe('JRP101');
  const next = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Siguiente')!;
  await act(async () => next.click());
  expect(api).toHaveBeenCalledTimes(2);
  expect(new URLSearchParams(location.search).get('pagina')).toBe('3');

  // App remounts the history view on accepted browser history navigation.
  for (const [key, url, query] of [
   ['back', '/historial-j5?pagina=1', '/legacy/work-orders?q=&page=1&pageSize=25'],
   ['forward', plateUrl, '/legacy/work-orders?q=JRP101&from=2024-01-01&to=2026-01-07&page=2&pageSize=25'],
  ]) {
   vi.mocked(api).mockClear();
   window.history.replaceState(null, '', url);
   await act(async () => root.render(<LegacyHistory key={key} userId="fixture" />));
   expect(api).toHaveBeenCalledExactlyOnceWith(query);
  }
 } finally {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(state, '', previous);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
 }
});

it('shows a connection error and lets the user resubmit the same filters', async () => {
 const previous = window.location.href;
 const state = window.history.state;
 const container = document.body.appendChild(document.createElement('div'));
 const root = createRoot(container);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.mocked(api).mockRejectedValueOnce(new TypeError('offline'))
  .mockResolvedValueOnce({orders: [], total: 0, page: 1, pageSize: 25});
 try {
  window.history.replaceState(null, '', '/historial-j5?q=JRP101');
  await act(async () => root.render(<LegacyHistory userId="fixture" />));
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Revisa la conexión');
  expect(container.querySelector('button')?.disabled).toBe(false);
  await act(async () => container.querySelector('button')!.click());
  expect(vi.mocked(api).mock.calls).toEqual(Array(2).fill(['/legacy/work-orders?q=JRP101&page=1&pageSize=25']));
  expect(container.querySelector('[role=alert]')).toBeNull();
  expect(container.textContent).toContain('No se encontraron trabajos.');
 } finally {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(state, '', previous);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
 }
});
