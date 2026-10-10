// @vitest-environment happy-dom
import {act,useState} from 'react';import {createRoot} from 'react-dom/client';import {expect,it,vi} from 'vitest';
import {EntitySearch} from './EntitySearch';import {api} from './api';import {fresh} from './autosave';
vi.mock('./api',()=>({api:vi.fn()}));
it('late vehicles from the former customer cannot replace the new owner selection',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const a={id:crypto.randomUUID(),fullName:'Owner A',identification:'123456789',phone:'88888888',email:null},b={...a,id:crypto.randomUUID(),fullName:'Owner B',identification:'987654321'};
 let resolveA!:(v:unknown)=>void;const delayed=new Promise(r=>resolveA=r);
 vi.mocked(api).mockImplementation(async path=>{if(path==='/vehicles?customerId='+a.id)return delayed as never;if(path==='/vehicles?customerId='+b.id)return {vehicles:[{id:'vb',ownerId:b.id,plate:'ABC1234',make:'Toyota',model:'Corolla',year:2020,owner:b}]} as never;if(path.startsWith('/customers'))return {customers:[path.includes('OwnerB')?b:a]} as never;return {vehicles:[]} as never;});
 function Form(){const [draft,setDraft]=useState(fresh().draft);return <EntitySearch draft={draft} onSelect={setDraft}/>;}
 const enter=async(value:string)=>{await act(async()=>{const input=container.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>{container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});};
 try{await act(async()=>root.render(<Form/>));await enter('OwnerA');await act(async()=>{Array.from(container.querySelectorAll('button')).find(x=>x.textContent?.includes('Owner A'))!.click();});await enter('OwnerB');await act(async()=>{Array.from(container.querySelectorAll('button')).find(x=>x.textContent?.includes('Owner B'))!.click();});expect(container.textContent).toContain('ABC1234');
 await act(async()=>{resolveA({vehicles:[]});for(let i=0;i<10;i++)await Promise.resolve();});expect(container.textContent).toContain('ABC1234');expect(container.textContent).not.toContain('Owner A');
 }finally{await act(async()=>root.unmount());container.remove();vi.clearAllMocks();vi.unstubAllGlobals();}
});
it('new customer typed and persisted by autosave can confirm ownership without selecting a search result',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);const transfer=vi.fn();
 const owner={id:crypto.randomUUID(),fullName:'Old owner',identification:'111222333',phone:'88888888',email:null},vehicleId=crypto.randomUUID(),customerId=crypto.randomUUID();
 vi.mocked(api).mockResolvedValue({vehicles:[{id:vehicleId,ownerId:owner.id,plate:'TST543',make:'Toyota',model:'Corolla',year:2020,owner}]});
 let draft={...fresh().draft,customerId:owner.id,customerName:owner.fullName,identification:owner.identification,vehicleId,plate:'TST543'};
 const render=()=>act(async()=>root.render(<EntitySearch draft={draft} onSelect={next=>{draft=next as typeof draft;}} allowTransfer onTransfer={transfer}/>));
 try{await render();await act(async()=>{Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Cambiar cliente manteniendo este vehículo')!.click();});await render();
 expect(container.textContent).toContain('El cambio de dueño queda pendiente');
 // The newly entered customer obtains its ID from the successful autosave response, without search selection.
 draft={...draft,customerId,customerName:'Fixture customer',identification:'444555666',phone:'11111111'};await render();
 const update=Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Actualizar dueño a Fixture customer');expect(update).toBeTruthy();await act(async()=>update!.click());expect(transfer).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());container.remove();vi.clearAllMocks();vi.unstubAllGlobals();}
});
it('customer with no owned vehicles receives an honest empty state and plate recovery instructions',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);const customer={id:crypto.randomUUID(),fullName:'Fixture customer',identification:'444555666',phone:'11111111',email:null};
 vi.mocked(api).mockImplementation(async path=>path.startsWith('/customers')?{customers:[customer]} as never:{vehicles:[]} as never);
 try{await act(async()=>root.render(<EntitySearch draft={fresh().draft} onSelect={()=>{}}/>));await act(async()=>{const input=container.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'fixture');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>{Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Buscar')!.click();});await act(async()=>{Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.startsWith('Fixture customer'))!.click();});expect(container.textContent).toContain('no tiene vehículos registrados a su nombre');expect(container.textContent).not.toContain('Elige uno de sus vehículos');
 }finally{await act(async()=>root.unmount());container.remove();vi.clearAllMocks();vi.unstubAllGlobals();}
});
