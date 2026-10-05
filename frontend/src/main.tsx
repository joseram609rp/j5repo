import { draftSchema, itemSchema } from '../../backend/src/validation';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Autosave, fresh, storage, type Draft } from './autosave';
import { trackActivity, type Session } from './session';
import './style.css';
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('Inicia sesión para continuar.');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const saver = useRef<Autosave | null>(null);
  useEffect(() => {
    void api('/health').catch(() => setMessage('La base de datos no está disponible. Revisa la configuración o reintenta en unos momentos.'));
    void api<Session>('/auth/me').then(setSession).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!session) return;
    let disposed = false; let release: (() => void) | undefined;
    const expire = () => { if (disposed) return; void saver.current?.pause().catch(() => undefined); setDraft(null); setSession(null); setMessage('La sesión terminó. Vuelve a entrar para recuperar tu borrador.'); };
    const stop = trackActivity(session, expire);
    if (!navigator.locks) { setMessage('Este navegador no admite el bloqueo de edición. Usa una versión reciente.'); return stop; }
    void navigator.locks.request(`j5-editor-${session.userId}`, { ifAvailable: true }, async lock => {
      if (disposed) return;
      if (!lock) { setMessage('El borrador está abierto en otra pestaña. Ciérrala y recarga aquí.'); return; }
      try {
        const record = await storage.read(session.userId) ?? fresh();
        if (disposed) return;
        const service = new Autosave(record, session.userId, session.csrf, text => { if (!disposed) setMessage(text); }, expire);
        saver.current = service; setDraft(record.draft); setMessage('Borrador recuperado en este dispositivo');
        void service.sync();
        await new Promise<void>(resolve => { release = resolve; });
        await service.pause();
      } catch { setMessage('No se pudo abrir el almacenamiento local. Revisa los permisos del navegador.'); }
    });
    const online = () => void saver.current?.sync();
    window.addEventListener('online', online);
    return () => { disposed = true; stop(); release?.(); saver.current = null; window.removeEventListener('online', online); };
  }, [session]);
  async function login() {
    setBusy(true);
    try { setSession(await api<Session>('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })); }
    catch { setMessage('No fue posible entrar. Revisa tus credenciales y la conexión.'); }
    finally { setPassword(''); setBusy(false); }
  }
  async function logout() {
    try { await saver.current?.pause(); await api('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session!.csrf } }); setSession(null); setDraft(null); setMessage('Sesión cerrada. Borrador conservado en este dispositivo.'); }
    catch { setMessage('No se pudo cerrar la sesión. Reintenta antes de dejar el dispositivo.'); }
  }
  function saveDraft(next: Draft) { setDraft(next); void saver.current?.edit(next); }
  function editItem(index:number,field:'description'|'price',value:string) {
    if (!draft) return;
    saveDraft({...draft,items:draft.items?.map((item,i)=>i===index?{...item,[field]:field==='price'?Number(value):value}:item)});
  }
  function edit(field: keyof Draft, value: string) {
    if (!draft) return;
    const next = { ...draft, [field]: (field === 'mileage' || field === 'year') ? (value === '' ? null : Number(value)) : value };
    setDraft(next); void saver.current?.edit(next);
  }
  return <div className="layout"><header><a className="brand" href="/" aria-label="Frenos La Bandera, inicio"><img className="brand-logo" src="/logo.png" alt="J5 Taller de Frenos La Bandera"/></a><span className="tag">GESTIÓN DEL TALLER</span>{session && <button className="quiet" onClick={() => void logout()}>Cerrar sesión</button>}</header>
    <main><section className="intro"><p className="eyebrow">EL TALLER, A MANO</p><h1>Menos papel.<br/><span>Más tiempo en el taller.</span></h1><p>Un lugar para las órdenes, los vehículos y el trabajo de cada día.</p></section>
      <div className="grid"><section className="card editor"><div className="card-top"><span className="number">01</span><div><h2>Orden abierta</h2><p>Tu trabajo, siempre a mano</p></div><span className="badge">ABIERTA</span></div>
        <p className="notice">Completa los datos del cliente, vehículo y trabajos. Tus cambios se guardan automáticamente.</p>
        {!session ? <form className="empty" onSubmit={e => { e.preventDefault(); void login(); }}><img className="login-logo" src="/logo.png" alt="Frenos La Bandera"/><h3>Ingresa al taller</h3><label>Usuario<input autoComplete="username" required maxLength={64} value={username} onChange={e => setUsername(e.target.value)}/></label><label>Contraseña<input type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={e => setPassword(e.target.value)}/></label><button disabled={busy} type="submit">{busy ? 'Ingresando…' : 'Entrar'}</button></form> : draft ? <form onSubmit={e => e.preventDefault()}>
          <label>Nombre del cliente<input value={draft.customerName} maxLength={200} onChange={e => edit('customerName', e.target.value)}/></label><div className="fields"><label>Placa<input value={draft.plate} placeholder="ABC123" maxLength={20} onChange={e => edit('plate', e.target.value.toUpperCase().replace(/[\s-]/g,''))}/></label><label>Kilometraje<input type="number" min={0} max={10000000} step={1} value={draft.mileage ?? ''} onChange={e => edit('mileage', e.target.value)}/></label></div>
          <div className="fields"><label>Cédula (9 dígitos)<input inputMode="numeric" maxLength={9} value={draft.identification ?? ''} onChange={e=>edit('identification',e.target.value)}/></label><label>Teléfono (8 dígitos)<input inputMode="numeric" maxLength={8} value={draft.phone ?? ''} onChange={e=>edit('phone',e.target.value)}/></label></div>
          <label>Correo opcional<input type="email" maxLength={254} value={draft.email ?? ''} onChange={e=>edit('email',e.target.value)}/></label>
          <div className="fields"><label>Marca<input maxLength={100} value={draft.make ?? ''} onChange={e=>edit('make',e.target.value)}/></label><label>Año<input type="number" min={1950} max={new Date().getUTCFullYear()+1} step={1} value={draft.year ?? ''} onChange={e=>edit('year',e.target.value)}/></label></div>
          <p>Mecánico: {session.fullName ?? session.username}</p>
          <h3>Trabajos realizados · CRC</h3>
          {(draft.items ?? []).map((item,index)=><div className="fields" key={index}><label>Descripción<input maxLength={500} value={item.description} onChange={e=>editItem(index,'description',e.target.value)}/></label><label>Precio final<input type="number" min={0.01} max={9999999999.99} step={0.01} value={item.price || ''} onChange={e=>editItem(index,'price',e.target.value)}/></label><button type="button" className="quiet" onClick={()=>saveDraft({...draft,items:draft.items?.filter((_,i)=>i!==index)})}>Quitar trabajo</button>{!itemSchema.safeParse(item).success && <p className="validation">Indica descripción y precio positivo con hasta dos decimales.</p>}</div>)}
          <button type="button" onClick={()=>saveDraft({...draft,items:[...(draft.items ?? []),{description:'',price:0}]})}>Agregar trabajo</button>
          {!draftSchema.safeParse(draft).success && <p className="validation" role="alert">Revisa cédula, teléfono, correo, placa, año y trabajos. Los cambios se conservan en este dispositivo.</p>}
          <label>Observaciones generales<textarea rows={3} maxLength={5000} value={draft.notes} onChange={e => edit('notes', e.target.value)}/></label><label>Recomendaciones<textarea rows={3} maxLength={5000} value={draft.recommendations} onChange={e => edit('recommendations', e.target.value)}/></label><button type="button" className="quiet" onClick={() => void saver.current?.sync()}>Reintentar sincronización</button>
        </form> : <p>Preparando borrador…</p>}<p className="status" role="status" aria-live="polite">{message}</p></section>
      <aside><section className="card"><p className="eyebrow">PRÓXIMOS MÓDULOS</p><h2>Todo en su lugar.</h2><ul className="modules"><li><b>Órdenes abiertas</b><span>Retomar el trabajo pendiente</span></li><li><b>Historial</b><span>Consultar por cliente o vehículo</span></li><li><b>Equipo del taller</b><span>Usuarios y permisos</span></li></ul></section><section className="info"><h3>Pensado para seguir trabajando</h3><p>Respaldo en este dispositivo, reintentos de conexión y protección frente a cambios simultáneos.</p><small>Sesión: hasta 2 horas sin actividad.</small></section></aside></div>
    </main><footer>Frenos La Bandera <span>Una sucursal · Precios en colones</span></footer></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
