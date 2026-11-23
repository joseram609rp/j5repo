import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { readView, saveView } from './navigation';
type Work={id:string;plate:string|null;workDate:string|null;description:string|null;description2:string|null;price:string|null;mechanic:string|null;dateQuality:string|null;originalDate?:string|null;originalNumber?:string|null};
type Results={orders:Work[];total:number;page:number;pageSize:number};
type Detail={work:Work;vehicles:{id:string;customerName:string|null;identification:string|null;phone:string|null;make:string|null;model:string|null}[]};
export function LegacyHistory({userId}: {userId?: string} = {}) {
 const [initial] = useState(() => {
  const params = new URLSearchParams(window.location.search);
  const saved = readView<{q: string}>(userId);
  const page = Number(params.get('pagina') ?? 1);
  return {
   q: params.get('q') ?? saved?.q ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '',
   page: Number.isInteger(page) && page > 0 ? page : 1,
   id: params.get('trabajo') ?? '',
   hasPage: params.has('pagina'),
  };
 });
 const [q,setQ]=useState(initial.q); const [from,setFrom]=useState(initial.from); const [to,setTo]=useState(initial.to);
 const [results,setResults]=useState<Results>(); const [detail,setDetail]=useState<Detail>();
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const search=useRef(''); const generation=useRef(0);
 const detailHeading = useRef<HTMLHeadingElement>(null);
 const detailTrigger = useRef<HTMLButtonElement>(null);
 useEffect(() => {
   if (detail) detailHeading.current?.focus();
 }, [detail]);
 function closeDetail() {
   setDetail(undefined);
   persist(results?.page ?? initial.page);
   detailTrigger.current?.focus();
 }
 function persist(page: number, id?: string) {
   if (!userId) return;
   const filters = new URLSearchParams(search.current);
   const hasFilters = Boolean(filters.get('q') || filters.get('from') || filters.get('to'));
   saveView(userId, undefined, {
     q: filters.get('q') ?? undefined,
     from: filters.get('from') ?? undefined, to: filters.get('to') ?? undefined,
     pagina: page > 1 || !hasFilters ? String(page) : undefined, trabajo: id,
   });
 }
 async function load(page:number,newSearch=false) {
  const current=++generation.current; setBusy(true);setError('');setDetail(undefined);
  if(newSearch) { search.current=new URLSearchParams({q,...(from?{from}:{}),...(to?{to}:{})}).toString();setResults(undefined); }
  try {persist(page);const data=await api<Results>(`/legacy/work-orders?${search.current}&page=${page}&pageSize=25`);if(current===generation.current)setResults(data);}
  catch {if(current===generation.current)setError('No se pudo consultar el historial. Revisa la conexión y vuelve a buscar.');}
  finally {if(current===generation.current)setBusy(false);}
 }
 async function open(id:string) {
  const current=++generation.current;setBusy(true);setError('');setDetail(undefined);
  try {persist(results?.page ?? initial.page, id);
  const data=await api<Detail>('/legacy/work-orders/'+encodeURIComponent(id));if(current===generation.current)setDetail(data);}
  catch {if(current===generation.current)setError('No se pudo cargar el detalle. Intenta de nuevo.');}
  finally {if(current===generation.current)setBusy(false);}
 }
 useEffect(() => {
   search.current = new URLSearchParams({q: initial.q, ...(initial.from ? {from: initial.from} : {}), ...(initial.to ? {to: initial.to} : {})}).toString();
   if (/^[a-z\d_-]{1,100}$/i.test(initial.id)) void open(initial.id);
   else if (initial.q || initial.from || initial.to || initial.hasPage) void load(initial.page);
   return () => { generation.current++; };
 }, []);
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
