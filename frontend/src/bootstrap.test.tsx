import { SessionGate } from './SessionGate';
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App';
import { bootstrapSession } from './bootstrap';
import { api, ApiError } from './api';
const session={userId:'user',csrf:'csrf',idleMs:7200000,lastActivity:Date.now()};
it('initial application renders branded checking state, never login or draft inputs',()=>{
 const html=renderToStaticMarkup(<App/>);
 expect(html).toContain('Comprobando sesión'); expect(html).toContain('/logo.png');
 expect(html).not.toContain('autoComplete="username"');expect(html).not.toContain('Ingresa al taller');expect(html).not.toContain('data-field=');
});
it('pending auth has no anonymous transition; valid session resolves authenticated',async()=>{
 let resolve!:(value:typeof session)=>void;
 const auth=new Promise<typeof session>(r=>resolve=r);
 const request=vi.fn((path:string)=>path==='/health'?Promise.resolve({status:'ok'}):auth) as unknown as typeof api;
 const settled=vi.fn();const result=bootstrapSession(request).then(settled);
 await Promise.resolve(); expect(settled).not.toHaveBeenCalled();resolve(session);await result;
 expect(settled).toHaveBeenCalledWith({status:'authenticated',session,healthOk:true});
});
it('401 resolves anonymous only after the auth check finishes',async()=>{
 let reject!:(error:Error)=>void;const auth=new Promise((_,r)=>reject=r);
 const request=vi.fn((path:string)=>path==='/health'?Promise.resolve({}):auth) as unknown as typeof api;
 const settled=vi.fn();const result=bootstrapSession(request).then(settled);await Promise.resolve();expect(settled).not.toHaveBeenCalled();
 reject(new ApiError(401,'SESSION_EXPIRED'));await result;expect(settled).toHaveBeenCalledWith({status:'anonymous',session:null,healthOk:true});
});
it('connection failure does not pretend the user is anonymous',async()=>{
 const request=vi.fn().mockRejectedValue(new TypeError('offline')) as typeof api;
 await expect(bootstrapSession(request)).rejects.toThrow('SESSION_CHECK_FAILED');
});
it('valid authentication survives failed health so local draft can recover',async()=>{
 const request=vi.fn((path:string)=>path==='/health'?Promise.reject(new Error('offline')):Promise.resolve(session)) as unknown as typeof api;
 expect(await bootstrapSession(request)).toEqual({status:'authenticated',session,healthOk:false});
});

it('session gate renders login only in resolved anonymous state',()=>{
 const render=(status:'checking'|'authenticated'|'anonymous')=>renderToStaticMarkup(<SessionGate status={status} checking={<p>Comprobando sesión</p>} anonymous={<form><input autoComplete="username"/><p>Ingresa al taller</p></form>} authenticated={<p>Borrador recuperado</p>}/>);
 expect(render('checking')).not.toContain('Ingresa al taller');
 expect(render('authenticated')).toContain('Borrador recuperado');expect(render('authenticated')).not.toContain('username');
 expect(render('anonymous')).toContain('Ingresa al taller');expect(render('anonymous')).not.toContain('Borrador recuperado');
});
