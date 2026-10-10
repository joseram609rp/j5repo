// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, useState } from 'react';import { createRoot } from 'react-dom/client';
import { CatalogInput } from './CatalogInput';import { Autosave, fresh } from './autosave';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('keyboard selection, make scoped models, custom text and autosave share the normal edit path',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();const persist=vi.fn().mockResolvedValue(undefined);const send=vi.fn().mockResolvedValue({version:'1'});const saver=new Autosave(fresh(),'user','csrf',()=>{},()=>{},persist,send);
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 function Form(){const [make,setMake]=useState('');const [model,setModel]=useState('');return <><CatalogInput aria-label="Marca" value={make} values={['Toyota','Suzuki']} onValue={v=>{setMake(v);void saver.edit({...saver.state.draft,make:v});}}/><CatalogInput aria-label="Modelo" value={model} values={make==='Toyota'?['Hilux','Fortuner']:make==='Suzuki'?['Jimny']:[]} onValue={v=>{setModel(v);void saver.edit({...saver.state.draft,model:v});}}/></>;}
 await act(async()=>root.render(<Form/>));const [make,model]=Array.from(container.querySelectorAll('input'));
 const type=async(input:HTMLInputElement,value:string)=>{await act(async()=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});};
 await type(make!,'To');expect(container.textContent).toContain('Toyota');await act(async()=>{make!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));});await act(async()=>{make!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});expect(make!.value).toBe('Toyota');expect(saver.state.draft.make).toBe('Toyota');
 await type(model!,'Hi');expect(container.textContent).toContain('Hilux');expect(container.textContent).not.toContain('Jimny');await act(async()=>{(container.querySelector('[role=option]') as HTMLElement).click();});expect(model!.value).toBe('Hilux');expect(saver.state.draft.model).toBe('Hilux');
 await type(make!,'Marca propia');await type(model!,'Modelo propio');expect(container.querySelector('[role=listbox]')).toBeNull();expect(saver.state.draft).toMatchObject({make:'Marca propia',model:'Modelo propio'});expect(persist).toHaveBeenCalled();
 await act(async()=>root.unmount());container.remove();await saver.pause();
});
it.each(['Tab','Enter'])('accepts the sole suggestion using %s without silently completing input',async key=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 function Form(){const [value,setValue]=useState('toyot');return <CatalogInput value={value} values={['Toyota','Suzuki']} onValue={setValue}/>;}
 await act(async()=>root.render(<Form/>));const input=container.querySelector('input')!;await act(async()=>input.focus());expect(input.value).toBe('toyot');
 await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));});expect(input.value).toBe('Toyota');
 await act(async()=>root.unmount());container.remove();
});
it('Tab leaves ambiguous suggestions and free text untouched',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);const choose=vi.fn();
 await act(async()=>root.render(<CatalogInput value="To" values={['Toyota','Tornado']} onValue={choose}/>));const input=container.querySelector('input')!;await act(async()=>input.focus());await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));});expect(choose).not.toHaveBeenCalled();
 await act(async()=>root.render(<CatalogInput value="Custom" values={['Toyota']} onValue={choose}/>));await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});expect(choose).not.toHaveBeenCalled();await act(async()=>root.unmount());container.remove();
});
