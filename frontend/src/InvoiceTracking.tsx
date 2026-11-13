import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { InvoiceCursor, InvoiceEntry, InvoiceFilters, InvoicePage, InvoiceState } from '../../backend/src/invoice-types';
import { api, ApiError } from './api';
import { formatCRC, formatWorkDate } from './form-validation';
import type { Session } from './session';

const endpoint = '/admin/invoice-tracking';
const fields = [
  ['plate', 'Placa', 'text'],
  ['identification', 'Cédula del cliente', 'text'],
  ['orderNumber', 'Número OT', 'text'],
  ['from', 'Desde', 'date'],
  ['to', 'Hasta', 'date'],
] as const;

function useInvoiceRefresh(refresh: () => void) {
  const current = useRef(refresh);
  useLayoutEffect(() => { current.current = refresh; }, [refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      timer = setTimeout(() => current.current(), 100);
    };
    window.addEventListener('focus', schedule);
    window.addEventListener('pageshow', schedule);
    window.addEventListener('online', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', schedule);
      window.removeEventListener('pageshow', schedule);
      window.removeEventListener('online', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);
}

export function InvoiceCount() {
  const [count, setCount] = useState<number>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useInvoiceRefresh(() => setRevision(value => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    void api<{ count: number }>(endpoint + '/count', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setCount(result.count);
      setFailed(false);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [revision]);
  return <span>{failed ? 'Conteo no disponible' : count === undefined ? 'Consultando pendientes…' : `${count} pendientes`}</span>;
}

function invoiceError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 401) return 'La sesión terminó. Volvé a iniciar sesión.';
  if (error instanceof ApiError && error.status === 403) return 'Esta sección es exclusiva para administradores.';
  return fallback;
}

export function InvoiceTracking({ session }: { session: Session }) {
  const [state, setState] = useState<InvoiceState>('pending');
  const [input, setInput] = useState<InvoiceFilters>({});
  const [filters, setFilters] = useState<InvoiceFilters | null>({});
  const [cursors, setCursors] = useState<InvoiceCursor[]>([]);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<InvoicePage>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [selected, setSelected] = useState<InvoiceEntry>();
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const cursor = cursors.at(-1);

  function refresh() {
    setLoading(true);
    setRevision(value => value + 1);
  }

  useInvoiceRefresh(() => {
    if (filters && !selected && !inFlight.current) refresh();
  });

  useEffect(() => {
    if (!filters) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ state });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (cursor) {
      params.set('afterDate', cursor.date);
      params.set('afterId', cursor.id);
    }
    void api<InvoicePage>(endpoint + '?' + params.toString(), { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (!result.entries.length && cursor) {
        setCursors(previous => previous.slice(0, -1));
        return;
      }
      setPage(result);
      setLoadError('');
      setLoading(false);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setPage(undefined);
      setLoadError(invoiceError(error, 'No se pudieron cargar las facturas.'));
      setLoading(false);
    });
    return () => controller.abort();
  }, [state, filters, cursor, revision]);

  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    const element = dialog.current;
    if (!selected || !element) return;
    element.showModal();
    return () => element.close();
  }, [selected]);

  function startSearch(next: InvoiceFilters | null) {
    setFilters(next);
    setCursors([]);
    setPage(undefined);
    setLoadError('');
    setFilterError('');
    setNotice(undefined);
    setLoading(next !== null);
  }

  function switchState(next: InvoiceState) {
    if (state === next) return;
    setState(next);
    setInput({});
    startSearch(next === 'pending' ? {} : null);
  }

  function search(event: FormEvent) {
    event.preventDefault();
    const next = {
      ...input,
      plate: input.plate?.trim().replace(/[\s-]/g, ''),
      identification: input.identification?.trim(),
      orderNumber: input.orderNumber?.trim(),
    };
    if (next.from && next.to && next.from > next.to) {
      setFilterError('La fecha Desde debe ser anterior o igual a la fecha Hasta.');
      return;
    }
    if (state === 'issued' && !Object.values(next).some(Boolean)) {
      startSearch(null);
      setFilterError('Aplicá al menos un filtro para buscar facturas emitidas.');
      return;
    }
    startSearch(next);
  }

  function cancel() {
    if (inFlight.current) return;
    dialog.current?.close();
    setSelected(undefined);
    opener.current?.focus();
  }

  async function update() {
    if (!selected || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setSaving(true);
    setNotice(undefined);
    const issued = state === 'pending';
    try {
      await api(endpoint + '/orders/' + selected.id, {
        method: 'PUT',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf,
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': '"' + (selected.version ?? 'none') + '"',
        },
        body: JSON.stringify({ issued, orderVersion: selected.orderVersion }),
      });
      if (!controller.signal.aborted) setNotice({ text: issued ? 'Factura marcada como emitida.' : 'Factura devuelta a pendientes.' });
    } catch (error) {
      if (controller.signal.aborted) return;
      const stale = error instanceof ApiError && [404, 409, 412].includes(error.status);
      setNotice({ error: true, text: stale
        ? 'La orden o su estado cambió. Revisá la lista actualizada antes de volver a intentar.'
        : invoiceError(error, 'No se pudo confirmar el cambio. Revisá el estado en la lista actualizada.') });
    } finally {
      inFlight.current = null;
      if (!controller.signal.aborted) {
        dialog.current?.close();
        setSelected(undefined);
        setSaving(false);
        refresh();
        heading.current?.focus();
      }
    }
  }

  return (
    <section className="card" aria-labelledby="invoice-heading">
      <h2 id="invoice-heading" ref={heading} tabIndex={-1}>Facturas electrónicas</h2>
      <div className="invoice-tabs" role="group" aria-label="Estado de la factura">
        <button type="button" aria-pressed={state === 'pending'} onClick={() => switchState('pending')}>Pendientes</button>{' '}
        <button type="button" aria-pressed={state === 'issued'} onClick={() => switchState('issued')}>Emitidas</button>
      </div>
      <form onSubmit={search}>
        <div className="fields invoice-filters">
          {fields.map(([field, label, type]) => <label key={field}>
            {label}
            <input type={type} value={input[field] ?? ''} maxLength={type === 'text' ? 64 : undefined}
              inputMode={field === 'identification' ? 'numeric' : undefined}
              onChange={event => setInput({ ...input, [field]: event.target.value })} />
          </label>)}
        </div>
        <button type="submit">Buscar facturas</button>{' '}
        <button type="button" className="quiet" onClick={() => {
          setInput({});
          startSearch(state === 'pending' ? {} : null);
        }}>Limpiar filtros</button>
      </form>
      {filterError && <p role="alert">{filterError}</p>}
      {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      {!filters && !filterError && <p>Aplicá al menos un filtro para ver facturas emitidas.</p>}
      {loading && <p role="status">Consultando facturas…</p>}
      {!loading && loadError && <div><p role="alert">{loadError}</p>
        <button type="button" onClick={refresh}>Reintentar</button>
      </div>}
      {!loading && page && <>
        {!page.entries.length && <p role="status">{state === 'pending' ? 'No hay facturas pendientes que coincidan con esta consulta.' : 'No hay facturas emitidas que coincidan con esta consulta.'}</p>}
        <ul className="invoice-results">
          {page.entries.map(entry => <li key={entry.id} className="card">
            <h3>{entry.orderNumber}</h3>
            <p>{entry.customer}{entry.identification && <> · {entry.identification}</>}</p>
            <p>{[entry.plate, [entry.make, entry.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</p>
            <p><time dateTime={entry.date}>{formatWorkDate(entry.date)}</time> · {formatCRC(entry.total)}</p>
            <a href={'/?invoiceOrder=' + entry.id} target="_blank" rel="noopener noreferrer"
              aria-label={`Abrir orden ${entry.orderNumber} en una pestaña nueva`}>Abrir orden</a>{' '}
            <button type="button" onClick={event => {
              opener.current = event.currentTarget;
              setSelected(entry);
            }}>{state === 'pending' ? 'Marcar como emitida' : 'Volver a pendiente'}</button>
          </li>)}
        </ul>
        {(cursor || page.next) && <nav aria-label="Paginación de facturas">
          <button type="button" disabled={!cursor} onClick={() => {
            setLoading(true);
            setCursors(cursors.slice(0, -1));
            heading.current?.focus();
          }}>Anterior</button>
          <span>Página {cursors.length + 1}</span>
          <button type="button" disabled={!page.next} onClick={() => {
            if (!page.next) return;
            setLoading(true);
            setCursors([...cursors, page.next]);
            heading.current?.focus();
          }}>Siguiente</button>
        </nav>}
      </>}
      <dialog ref={dialog} className="confirmation invoice-dialog" aria-labelledby="invoice-confirm-title"
        aria-describedby="invoice-confirm-message" onCancel={event => { event.preventDefault(); cancel(); }}>
        <h3 id="invoice-confirm-title">{selected?.orderNumber}</h3>
        <p id="invoice-confirm-message">{state === 'pending'
          ? '¿Confirmás que la factura electrónica de esta orden ya fue emitida en el sistema de facturación?'
          : '¿Confirmás que querés devolver la factura electrónica de esta orden a pendientes?'}</p>
        <button type="button" className="quiet" autoFocus disabled={saving} onClick={cancel}>Cancelar</button>{' '}
        <button type="button" disabled={saving} onClick={() => void update()}>{saving ? 'Guardando…' : state === 'pending'
          ? 'Sí, marcar emitida' : 'Sí, volver a pendiente'}</button>
      </dialog>
    </section>
  );
}
