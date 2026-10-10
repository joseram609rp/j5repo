// @vitest-environment happy-dom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';
import {Users} from './Users';import {api,ApiError} from './api';import {passwordIssue} from './PasswordInput';
vi.mock('./api',async original=>({...await original<typeof import('./api')>(),api:vi.fn()}));
const session={userId:'admin',fullName:'Admin',role:'ADMIN' as const,csrf:'fixture',idleMs:7200000,lastActivity:Date.now()};
let container:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.mocked(api).mockResolvedValue({users:[]});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.clearAllMocks();vi.unstubAllGlobals();});
const mount=()=>act(async()=>root.render(<Users session={session}/>));
const button=(text:string)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text)!;
const click=(text:string)=>act(async()=>{button(text).click();});
const field=(text:string)=>Array.from(container.querySelectorAll('label')).find(l=>l.textContent?.startsWith(text))!.querySelector('input')!;
const type=(text:string,value:string)=>act(async()=>{const input=field(text);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
it('blocks mismatches and UTF-8 overflow; native password controls preserve autocomplete; confirm never leaves frontend',async()=>{
 await mount();await type('Usuario','fixture');await type('Nombre completo','Test');await type('Contraseña','Fixture-only-123!');await type('Confirmar contraseña','different');await click('Crear usuario');
 expect(container.textContent).toContain('Las contraseñas no coinciden');expect(vi.mocked(api).mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(0);
 const password=field('Contraseña');expect(password.type).toBe('password');expect(password.autocomplete).toBe('new-password');expect(password.parentElement!.querySelector('button')).toBeNull();expect(field('Confirmar contraseña').type).toBe('password');expect(field('Confirmar contraseña').parentElement!.querySelector('button')).toBeNull();
 await type('Confirmar contraseña','Fixture-only-123!');await click('Crear usuario');const request=vi.mocked(api).mock.calls.find(([,o])=>o?.method==='POST')!;
 expect(JSON.parse(request[1]!.body as string)).toEqual({username:'fixture',fullName:'Test',password:'Fixture-only-123!',role:'MECHANIC'});expect(field('Confirmar contraseña').value).toBe('');
 expect(passwordIssue('é'.repeat(37),'é'.repeat(37))).toContain('72 bytes');expect(passwordIssue('é'.repeat(36),'é'.repeat(36))).toBe('');
});
it('reset requires matching confirmation and sends one password only',async()=>{
 vi.mocked(api).mockResolvedValue({users:[{id:'target',username:'target',fullName:'Target',active:true,role:'MECHANIC'}]});await mount();await click('Reset de contraseña');await type('Nueva contraseña','Replacement-123!');await type('Confirmar nueva','mismatch');await click('Continuar');expect(container.querySelector('[role=dialog]')).toBeNull();expect(container.textContent).toContain('Las contraseñas no coinciden');
 await type('Confirmar nueva','Replacement-123!');await click('Continuar');await click('Confirmar');const request=vi.mocked(api).mock.calls.find(([,o])=>o?.method==='PATCH')!;expect(JSON.parse(request[1]!.body as string)).toEqual({password:'Replacement-123!'});
});
it('inactive filter, lockout/unlock and safe deletion are distinct; reload does not duplicate cards',async()=>{
 const users=[{id:'locked',username:'locked',fullName:'Locked',role:'MECHANIC',active:true,lockedUntil:Date.now()+900000,canDelete:false},{id:'unused',username:'unused',fullName:'Unused',role:'MECHANIC',active:false,canDelete:true},{id:'used',username:'used',fullName:'Used',role:'MECHANIC',active:false,canDelete:false}];
 vi.mocked(api).mockImplementation(async(_p,o)=>o?.method==='DELETE'?{} as never:{users} as never);await mount();expect(container.querySelectorAll('article')).toHaveLength(1);expect(container.textContent).toContain('Bloqueado temporalmente');await click('Desbloquear');expect(container.querySelectorAll('article')).toHaveLength(1);
 await act(async()=>{(container.querySelector('input[type=checkbox]') as HTMLInputElement).click();});expect(container.querySelectorAll('article')).toHaveLength(3);expect(container.textContent).toContain('Este usuario tiene historial');expect(Array.from(container.querySelectorAll('button')).filter(b=>b.textContent==='Eliminar definitivamente')).toHaveLength(1);await click('Eliminar definitivamente');expect(vi.mocked(api).mock.calls.some(([,o])=>o?.method==='DELETE')).toBe(false);await click('Confirmar');expect(vi.mocked(api).mock.calls.some(([,o])=>o?.method==='DELETE')).toBe(true);expect(container.querySelectorAll('article')).toHaveLength(3);
});
it('shows a precise duplicate username message',async()=>{
 vi.mocked(api).mockImplementation(async(_p,o)=>{if(o?.method==='POST')throw new ApiError(409,'USERNAME_EXISTS');return {users:[]} as never;});await mount();await type('Usuario','jhernandez');await type('Nombre completo','Different name');await type('Contraseña','Fixture-only-123!');await type('Confirmar contraseña','Fixture-only-123!');await click('Crear usuario');expect(container.textContent).toContain('El nombre de usuario jhernandez ya existe.');
});

it.each(['create','reset'])('password confirmation in %s shows a live banner until it matches and notices are scoped',async mode=>{
 vi.mocked(api).mockResolvedValue({users:[{id:'target',username:'target',fullName:'Target',active:true,role:'MECHANIC'}]});await mount();
 if(mode==='reset')await click('Reset de contraseña');
 const first=mode==='reset'?'Nueva contraseña':'Contraseña';const confirmation=mode==='reset'?'Confirmar nueva':'Confirmar contraseña';
 const banner=()=>container.querySelector(mode==='reset'?'#reset-password-notice':'#create-password-notice');
 expect(banner()).toBeNull();await type(first,'Replacement-123!');expect(banner()).toBeNull();
 await type(confirmation,'R');expect(banner()?.textContent).toContain('Las contraseñas no coinciden');expect(field(confirmation).getAttribute('aria-invalid')).toBe('true');
 await type(confirmation,'Replacement-123!');expect(banner()).toBeNull();expect(field(confirmation).hasAttribute('aria-invalid')).toBe(false);
 await type(first,'Replacement-456!');expect(banner()?.textContent).toContain('Las contraseñas no coinciden');
 await type(confirmation,'');expect(banner()).not.toBeNull();
 await type(confirmation,'Replacement-456!');expect(banner()).toBeNull();
 expect(vi.mocked(api).mock.calls.some(([,o])=>o?.method==='POST'||o?.method==='PATCH')).toBe(false);
 if(mode==='reset'){
  expect(field(first).type).toBe('password');expect(field(confirmation).type).toBe('password');
  expect(field(first).autocomplete).toBe('new-password');expect(field(confirmation).autocomplete).toBe('new-password');
  expect(field(first).parentElement!.querySelector('button')).toBeNull();expect(field(confirmation).parentElement!.querySelector('button')).toBeNull();
  await type(confirmation,'different');await click('Cancelar');await click('Reset de contraseña');expect(banner()).toBeNull();expect(field(confirmation).value).toBe('');
 }
});
