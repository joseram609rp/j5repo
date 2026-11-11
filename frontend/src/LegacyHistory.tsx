import { useEffect, useRef, useState } from 'react';
import { api } from './api';
type Work={id:string;plate:string|null;workDate:string|null;description:string|null;description2:string|null;price:string|null;mechanic:string|null;dateQuality:string|null;originalDate?:string|null;originalNumber?:string|null};
type Results={orders:Work[];total:number;page:number;pageSize:number};
type Detail={work:Work;vehicles:{id:string;customerName:string|null;identification:string|null;phone:string|null;make:string|null;model:string|null}[]};
export function LegacyHistory() {
 const [q,setQ]=useState(''); const [from,setFrom]=useState(''); const [to,setTo]=useState('');
 const [results,setResults]=useState<Results>(); const [detail,setDetail]=useState<Detail>();
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const search=useRef(''); const generation=useRef(0);
 const detailHeading = useRef<HTMLHeadingElement>(null);
 const detailTrigger = useRef<HTMLButtonElement>(null);
 useEffect(() => {
   if (detail) detailHeading.current?.focus();
 }, [detail]);
 function closeDetail() {
   setDetail(undefined);
   detailTrigger.current?.focus();
 }
 async function load(page:number,newSearch=false) {
  const current=++generation.current; setBusy(true);setError('');setDetail(undefined);
  if(newSearch) { search.current=new URLSearchParams({q,...(from?{from}:{}),...(to?{to}:{})}).toString();setResults(undefined); }
  try {const data=await api<Results>(`/legacy/work-orders?${search.current}&page=${page}&pageSize=25`);if(current===generation.current)setResults(data);}
  catch {if(current===generation.current)setError('No se pudo consultar el historial. Revisa la conexión y vuelve a buscar.');}
  finally {if(current===generation.current)setBusy(false);}
 }
 async function open(id:string) {
  const current=++generation.current;setBusy(true);setError('');setDetail(undefined);
  try {const data=await api<Detail>('/legacy/work-orders/'+encodeURIComponent(id));if(current===generation.current)setDetail(data);}
  catch {if(current===generation.current)setError('No se pudo cargar el detalle. Intenta de nuevo.');}
  finally {if(current===generation.current)setBusy(false);}
 }
 return <section className="legacy-history" aria-label="Historial J5 antiguo"><h1>Historial J5 antiguo</h1><p>Archivo de consulta. Estos registros no se utilizan para crear órdenes, clientes ni vehículos actuales. Requiere conexión.</p>
 <form onSubmit={e=>{e.preventDefault();void load(1,true);}}><label>Placa, cliente o trabajo<input value={q} maxLength={200} onChange={e=>setQ(e.target.value)}/></label><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><button disabled={busy}>Buscar</button></form>
 {busy&&<p role="status">Consultando…</p>}{error&&<p role="alert">{error}</p>}
 {results&&<>
  <p role="status">{results.total} trabajos · Página {results.page}</p>
  {results.orders.length === 0 ? <p>No se encontraron trabajos.</p> : (
    <ul className="legacy-results" role="list">
      {results.orders.map(work => (
        <li key={work.id}>
          <button
            className="legacy-result"
            type="button"
            aria-disabled={busy}
            onClick={event => {
              if (busy) return;
              detailTrigger.current = event.currentTarget;
              void open(work.id);
            }}
          >
            <strong className="legacy-result-plate">{work.plate ?? 'Sin placa'}</strong>
            <span className="legacy-result-date">{work.workDate ?? 'Sin fecha'}</span>
            <span className="legacy-result-description">{work.description ?? 'Sin descripción'}</span>
          </button>
        </li>
      ))}
    </ul>
  )}
  <div className="legacy-pagination">
    <button disabled={busy||results.page<=1} onClick={()=>void load(results.page-1)}>Anterior</button>
    <button disabled={busy||results.page*results.pageSize>=results.total} onClick={()=>void load(results.page+1)}>Siguiente</button>
  </div>
 </>}
 {detail&&<article><h2 ref={detailHeading} tabIndex={-1}>Trabajo histórico</h2><p>{detail.work.plate??'Sin placa'} · {detail.work.workDate??'Sin fecha'}</p><p>Fecha original: {detail.work.originalDate??'Sin dato'} · Calidad: {detail.work.dateQuality??'Sin dato'}</p><p>{detail.work.description}</p><p>{detail.work.description2}</p><p>Importe histórico: {detail.work.price??'Sin dato'} · Mecánico: {detail.work.mechanic??'Sin dato'}</p><h3>Fichas históricas de esta placa</h3><p>Pueden existir fichas diferentes para una misma placa; se conservan por separado.</p>{detail.vehicles.map(v=><div key={v.id}><p>{v.customerName??'Sin nombre'} · Cédula: {v.identification??'Sin dato'} · Teléfono: {v.phone??'Sin dato'} · {v.make??'Sin marca'} {v.model??'Sin modelo'}</p></div>)}<button onClick={closeDetail}>Cerrar detalle</button></article>}
 </section>;
}
