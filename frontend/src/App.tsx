import { SessionGate } from './SessionGate';
import { totalAmount } from '../../backend/src/validation';
import { bootstrapSession, type SessionStatus } from './bootstrap';
import { visibleErrors, formatCRC } from './form-validation';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { loginErrorMessage } from './login-error';
import { Autosave, fresh, storage, type Draft } from './autosave';
import { trackActivity, type Session } from './session';
import './style.css';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  const [bootstrapError, setBootstrapError] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const saver = useRef<Autosave | null>(null);
  async function checkSession() {
    setBootstrapError(false); setSessionStatus('checking');
    try { const result = await bootstrapSession(); setSession(result.session); setSessionStatus(result.status);
      if (result.status === 'anonymous') setMessage('Inicia sesión para continuar.');
      if (!result.healthOk) setMessage('La base de datos no está disponible. Tu copia local está protegida.');
    } catch { setBootstrapError(true); }
  }
  useEffect(() => { void checkSession(); }, []);
  useEffect(() => {
    if (!session) return;
    let disposed = false; let release: (() => void) | undefined;
    const expire = () => { if (disposed) return; void saver.current?.pause().catch(() => undefined); setDraft(null); setSession(null); setSessionStatus('anonymous'); setTouched(new Set()); setMessage('La sesión terminó. Vuelve a entrar para recuperar tu borrador.'); };
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
    try { setSession(await api<Session>('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })); setSessionStatus('authenticated'); }
    catch (error) { setMessage(loginErrorMessage(error)); }
    finally { setPassword(''); setBusy(false); }
  }
  async function logout() {
    try { await saver.current?.pause(); await api('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session!.csrf } }); setSession(null); setSessionStatus('anonymous'); setTouched(new Set()); setDraft(null); setMessage('Sesión cerrada. Borrador conservado en este dispositivo.'); }
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
  const errors = draft ? visibleErrors(draft, touched) : [];
  function validation(field:string) { const error=errors.find(e=>e.field===field); return error ? <small className="validation" id={`${field}-error`}>{error.message}</small> : null; }
  function accessibility(field:string) { return {'aria-invalid':errors.some(e=>e.field===field), 'aria-describedby':errors.some(e=>e.field===field)?`${field}-error`:undefined}; }
  return <div className="layout"><header><a className="brand" href="/" aria-label="Frenos La Bandera, inicio"><img className="brand-logo" src="/logo.png" alt="J5 Taller de Frenos La Bandera"/></a><span className="tag">GESTIÓN DEL TALLER</span>{session && <button className="quiet" onClick={() => void logout()}>Cerrar sesión</button>}</header>
    <main><section className="intro"><p className="eyebrow">EL TALLER, A MANO</p><h1>Menos papel.<br/><span>Más tiempo en el taller.</span></h1><p>Un lugar para las órdenes, los vehículos y el trabajo de cada día.</p></section>
      <div className="grid"><section className="card editor"><div className="card-top"><span className="number">01</span><div><h2>Orden abierta</h2><p>Tu trabajo, siempre a mano</p></div><span className="badge">ABIERTA</span></div>
        <p className="notice">Completa los datos del cliente, vehículo y trabajos. Tus cambios se guardan automáticamente.</p>
        <SessionGate status={sessionStatus} checking={<div className="session-loading" role="status" aria-live="polite"><img className="login-logo" src="/logo.png" alt="J5 Taller de Frenos La Bandera"/><h3>{bootstrapError ? 'No se pudo comprobar la sesión' : 'Comprobando sesión…'}</h3>{bootstrapError && <button onClick={() => void checkSession()}>Reintentar</button>}</div>} anonymous={<form className="empty" onSubmit={e => { e.preventDefault(); void login(); }}><img className="login-logo" src="/logo.png" alt="Frenos La Bandera"/><h3>Ingresa al taller</h3><label>Usuario<input autoComplete="username" required maxLength={64} value={username} onChange={e => setUsername(e.target.value)}/></label><label>Contraseña<input type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={e => setPassword(e.target.value)}/></label><button disabled={busy} type="submit">{busy ? 'Ingresando…' : 'Entrar'}</button></form>} authenticated={draft && session ? <form noValidate onSubmit={e => e.preventDefault()} onBlur={e => { const field=e.target.getAttribute('data-field'); if(field) setTouched(current=>new Set(current).add(field)); }}>
          <h3>Datos del cliente</h3><label>Nombre completo<input data-field="customerName" {...accessibility('customerName')} value={draft.customerName} maxLength={200} onChange={e => edit('customerName', e.target.value)}/>{validation('customerName')}</label>
          <div className="fields"><label>Cédula (9 dígitos)<input data-field="identification" {...accessibility('identification')} inputMode="numeric" maxLength={9} value={draft.identification ?? ''} onChange={e=>edit('identification',e.target.value)}/>{validation('identification')}</label><label>Teléfono (8 dígitos)<input data-field="phone" {...accessibility('phone')} inputMode="numeric" maxLength={8} value={draft.phone ?? ''} onChange={e=>edit('phone',e.target.value)}/>{validation('phone')}</label></div>
          <label>Correo opcional<input data-field="email" {...accessibility('email')} type="email" maxLength={254} value={draft.email ?? ''} onChange={e=>edit('email',e.target.value)}/>{validation('email')}</label>
          <h3>Datos del vehículo</h3><div className="fields"><label>Placa<input data-field="plate" {...accessibility('plate')} value={draft.plate} placeholder="ABC123" maxLength={20} onChange={e => edit('plate', e.target.value.toUpperCase().replace(/[\s-]/g,''))}/>{validation('plate')}</label><label>Kilometraje<input data-field="mileage" {...accessibility('mileage')} type="number" min={0} max={10000000} step={1} value={draft.mileage ?? ''} onChange={e => edit('mileage', e.target.value)}/>{validation('mileage')}</label></div><div className="fields"><label>Marca<input data-field="make" {...accessibility('make')} maxLength={100} value={draft.make ?? ''} onChange={e=>edit('make',e.target.value)}/>{validation('make')}</label><label>Modelo<input data-field="model" {...accessibility('model')} maxLength={100} placeholder="Fortuner, Corolla, Hilux" value={draft.model ?? ''} onChange={e=>edit('model',e.target.value)}/>{validation('model')}</label></div><div className="fields"><label>Año<input data-field="year" {...accessibility('year')} type="number" min={1950} max={new Date().getUTCFullYear()+1} step={1} value={draft.year ?? ''} onChange={e=>edit('year',e.target.value)}/>{validation('year')}</label></div>
          <p>Mecánico: {session.fullName ?? session.username}</p>
          <h3>Trabajos realizados · CRC</h3>
          {(draft.items ?? []).map((item,index)=><div className="fields" key={index}><label>Descripción<input data-field={`item-${index}-description`} {...accessibility(`item-${index}-description`)} maxLength={500} value={item.description} onChange={e=>editItem(index,'description',e.target.value)}/>{validation(`item-${index}-description`)}</label><label>Precio final<input data-field={`item-${index}-price`} {...accessibility(`item-${index}-price`)} type="number" min={0.01} max={9999999999.99} step={0.01} value={item.price || ''} onChange={e=>editItem(index,'price',e.target.value)}/><small className="currency-preview">{formatCRC(item.price)}</small>{validation(`item-${index}-price`)}</label><button type="button" className="quiet" onClick={()=>{setTouched(current=>new Set([...current].filter(field=>!field.startsWith('item-'))));saveDraft({...draft,items:draft.items?.filter((_,i)=>i!==index)});}}>Quitar trabajo</button></div>)}
          <button type="button" onClick={()=>saveDraft({...draft,items:[...(draft.items ?? []),{description:'',price:0}]})}>Agregar trabajo</button>
          <p className="total">Total estimado: {formatCRC(totalAmount(draft.items))}</p><small>El servidor calcula el total oficial al guardar.</small>
          <label>Observaciones generales<textarea rows={3} maxLength={5000} value={draft.notes} onChange={e => edit('notes', e.target.value)}/></label><label>Recomendaciones<textarea rows={3} maxLength={5000} value={draft.recommendations} onChange={e => edit('recommendations', e.target.value)}/></label><button type="button" className="quiet" onClick={() => void saver.current?.sync()}>Reintentar sincronización</button>
        </form> : <div className="session-loading" role="status">Preparando borrador…</div>}/><p className="status" role="status" aria-live="polite">{message}</p></section>
      <aside><section className="card"><p className="eyebrow">PRÓXIMOS MÓDULOS</p><h2>Todo en su lugar.</h2><ul className="modules"><li><b>Órdenes abiertas</b><span>Retomar el trabajo pendiente</span></li><li><b>Historial</b><span>Consultar por cliente o vehículo</span></li><li><b>Equipo del taller</b><span>Usuarios y permisos</span></li></ul></section><section className="info"><h3>Pensado para seguir trabajando</h3><p>Respaldo en este dispositivo, reintentos de conexión y protección frente a cambios simultáneos.</p><small>Sesión: hasta 2 horas sin actividad.</small></section></aside></div>
    </main><footer>Frenos La Bandera <span>Una sucursal · Precios en colones</span></footer></div>;
}

