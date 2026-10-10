import { useState } from 'react';
import type { Draft, RecordState } from './autosave';
import { formatCRC } from './form-validation';

const groups: {label: string; fields: (keyof Draft)[]}[] = [
 {label:'Cliente',fields:['customerId','customerName','identification','phone','email']},
 {label:'Vehículo',fields:['vehicleId','plate','make','model','year']},
 {label:'Kilometraje',fields:['mileage']}, {label:'Trabajos',fields:['items']},
 {label:'Observaciones',fields:['notes']}, {label:'Recomendaciones',fields:['recommendations']},
 {label:'Método de pago',fields:['paymentMethod']}, {label:'Factura electrónica',fields:['electronicInvoice']},
];
const same = (a: Draft,b: Draft,fields:(keyof Draft)[]) => fields.every(f=>JSON.stringify(a[f])===JSON.stringify(b[f]));
const payments: Record<string,string> = {SINPE:'SINPE',CREDIT_CARD:'Tarjeta de crédito',DEBIT_CARD:'Tarjeta de débito',CASH:'Efectivo',BANK_TRANSFER:'Transferencia bancaria'};
function describe(d: Draft, fields:(keyof Draft)[]):string {
 return fields.filter(f=>!['customerId','vehicleId'].includes(f)).map(f=>{
  if(f==='items')return d.items?.map(i=>i.description+' · '+formatCRC(i.price)+(i.notes?' · '+i.notes:'')).join('\n') || 'Sin trabajos';
  if(f==='electronicInvoice')return d[f]===undefined?'Sin seleccionar':d[f]?'Sí':'No';
  if(f==='paymentMethod')return payments[d[f] ?? ''] ?? 'Sin seleccionar';
  return String(d[f] ?? '') || 'Sin completar';
 }).join(' · ');
}
export function downloadRecovery(record: RecordState) {
 const file = new Blob([JSON.stringify({orderId:record.id,draft:record.draft,recoveryCopies:record.recoveryCopies ?? []},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download='respaldo-orden-'+record.id+'.json';link.click();URL.revokeObjectURL(url);
}
export function ConflictReview({record,busy,onResolve}:{record:RecordState;busy:boolean;onResolve:(version:string,draft?:Draft)=>void}) {
 const remote=record.conflict!.remote;
 const base=record.pending?.baseDraft;
 const [choices,setChoices]=useState<Record<string,'local'|'remote'>>(()=>Object.fromEntries(groups.map(g=>[g.label,base && !same(record.draft,base,g.fields) && same(remote.draft,base,g.fields)?'local':'remote'])));
 const changed=groups.filter(g=>!same(record.draft,remote.draft,g.fields));
 const merge=()=>{
  const draft=structuredClone(remote.draft);
  for(const g of changed) if(choices[g.label]==='local') for(const f of g.fields) {
   if(record.draft[f]===undefined)delete draft[f];else Object.assign(draft,{[f]:structuredClone(record.draft[f])});
  }
  onResolve(remote.version,draft);
 };
 return <section className="confirmation conflict-review" aria-label="Resolver conflicto">
  <h3>Esta orden cambió mientras la editabas</h3>
  <p>Tu borrador está protegido. Compara los datos y elige qué conservar. Se guardará una copia de tu borrador anterior antes de aplicar tu decisión.</p>
  <button type="button" className="quiet" onClick={()=>downloadRecovery(record)}>Descargar mi borrador</button>
  {remote.status==='OPEN' ? <>
   {changed.map(g=><fieldset key={g.label} disabled={busy}>
    <legend>{g.label}</legend>
    <div className="conflict-values"><p><strong>Mi borrador</strong><br/>{describe(record.draft,g.fields)}</p><p><strong>Versión del servidor</strong><br/>{describe(remote.draft,g.fields)}</p></div>
    <label>Conservar<select aria-label={'Conservar '+g.label} value={choices[g.label] ?? 'remote'} onChange={e=>setChoices(c=>({...c,[g.label]:e.target.value as 'local'|'remote'}))}><option value="remote">Versión del servidor</option><option value="local">Mi borrador</option></select></label>
   </fieldset>)}
   <p>Guardar aplicará únicamente los datos elegidos sobre la versión revisada. El cierre, la cancelación y el cambio de dueño deben confirmarse nuevamente después.</p>
   <button type="button" disabled={busy} onClick={merge}>Guardar combinación revisada</button>
  </> : <p>La orden ya está {remote.status==='CLOSED'?'cerrada':'cancelada'}. Puedes conservar la versión del servidor y descargar tu borrador; esta revisión no reabre ni modifica la orden.</p>}
  <button type="button" className="quiet" disabled={busy} onClick={()=>onResolve(remote.version)}>Usar versión del servidor</button>
 </section>;
}
