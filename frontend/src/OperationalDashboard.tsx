import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { formatCRC, formatWorkDate } from './form-validation';
import { costaRicaToday, period, presets, shiftDate, sumSales, type Preset } from './operational-period';
import type { OperationalOrderPage, OperationalReport, OperationalTotals } from '../../backend/src/operational-types';
import './operational.css';

const endpoint = '/admin/operational';
const methods = {
  SINPE: 'SINPE', CASH: 'Efectivo', CREDIT_CARD: 'Tarjeta de crédito',
  DEBIT_CARD: 'Tarjeta de débito', BANK_TRANSFER: 'Transferencia bancaria', UNRECORDED: 'No registrado',
};
const dateLabel = (date: string) => formatWorkDate(date);
const ticket = (row: OperationalTotals) => row.closed ? formatCRC(row.gross / row.closed) : '—';

function useReport<T>(url: string | null) {
  const [result, setResult] = useState<{ url: string; data?: T; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setResult(undefined);
    void api<T>(url, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ url, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ url, error: error instanceof ApiError && error.status === 403
        ? 'Esta sección es exclusiva para administradores.' : 'No se pudo consultar el panel.' });
    });
    return () => controller.abort();
  }, [url, revision]);
  return { ...(result?.url === url ? result : undefined), retry: () => setRevision(value => value + 1) };
}

function Status({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div><p role="alert">{error}</p><button onClick={retry}>Reintentar</button></div>
    : <p role="status">Consultando indicadores…</p>;
}

type Bar = { label: string; value: number; secondary?: number };
function Bars({ title, rows, format = String }: { title: string; rows: Bar[]; format?: (value: number) => string }) {
  const max = Math.max(1, ...rows.map(row => Math.max(row.value, row.secondary ?? 0)));
  return <section className="op-block">
    <h3>{title}</h3>
    {!rows.length ? <p>Sin datos en el período.</p> : <ul className="op-bars">{rows.map(row => <li key={row.label}>
      <span>{row.label}</span>
      <div className="op-bar-values">
        <span><i aria-hidden="true" style={{ width: 100 * row.value / max + '%' }} />{format(row.value)}</span>
        {row.secondary !== undefined && <span><i aria-hidden="true" style={{ width: 100 * row.secondary / max + '%' }} />{format(row.secondary)}</span>}
      </div>
    </li>)}</ul>}
  </section>;
}

function Business({ report, onOrders }: { report: OperationalReport; onOrders: (status: 'OPEN' | 'CLOSED') => void }) {
  const row = report.totals;
  const metrics = [
    ['Ventas registradas con IVA', formatCRC(row.gross)], ['Ventas registradas sin IVA', formatCRC(row.net)],
    ['IVA', formatCRC(row.tax)], ['Ticket promedio con IVA', ticket(row)], ['Servicios de órdenes cerradas', row.services],
    ['Facturas requeridas', row.required], ['Facturas pendientes', row.pending],
  ];
  return <>
    <div className="op-kpis">
      {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      <div><button className="quiet" onClick={() => onOrders('CLOSED')}>Órdenes cerradas</button><strong>{row.closed}</strong></div>
      <div><button className="quiet" onClick={() => onOrders('OPEN')}>Órdenes abiertas</button><strong>{row.open}</strong></div>
    </div>
    {!row.closed && !row.open && <p role="status">No hay órdenes abiertas ni cerradas con estos filtros.</p>}
    <Bars title="Ventas registradas por método de pago" rows={Object.entries(methods).map(([method, label]) => {
      const gross = report.payments.find(payment => payment.method === method)?.gross ?? 0;
      const percent = row.gross ? 100 * gross / row.gross : 0;
      return { label: label + ' · ' + percent.toLocaleString('es-CR', { maximumFractionDigits: 1 }) + '%', value: gross };
    })} format={formatCRC} />
  </>;
}

function Mechanics({ report, onOrders }: { report: OperationalReport; onOrders: (status: 'OPEN' | 'CLOSED', mechanic: string) => void }) {
  return <>
    <p>Las cifras se atribuyen al mecánico asignado a la orden. La asignación por sí sola no identifica quién hizo cada servicio.</p>
    <Bars title="Órdenes cerradas por fecha de trabajo" rows={report.productivity.map(row => ({ label: row.name, value: row.closed }))} />
    <div className="op-table"><table><caption>Productividad por fecha de trabajo</caption>
      <thead><tr>{['Mecánico', 'Cerradas', 'Abiertas', 'Servicios', 'Con IVA', 'Sin IVA', 'Ticket promedio'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{report.productivity.map(row => <tr key={row.id}><th scope="row">{row.name}</th>
        <td><button className="quiet" onClick={() => onOrders('CLOSED', row.id)} aria-label={'Cerradas de ' + row.name}>{row.closed}</button></td>
        <td><button className="quiet" onClick={() => onOrders('OPEN', row.id)} aria-label={'Abiertas de ' + row.name}>{row.open}</button></td>
        <td>{row.services}</td><td>{formatCRC(row.gross)}</td><td>{formatCRC(row.net)}</td><td>{ticket(row)}</td>
      </tr>)}</tbody>
    </table></div>
    <Bars title={'Cierres reales del ' + dateLabel(report.comparisonWeek) + ' al ' + dateLabel(report.comparisonThrough) + ' y mismos días de la semana anterior'}
      rows={report.comparison.map(row => ({ label: report.mechanics.find(person => person.id === row.mechanic)?.name ?? row.mechanic, value: row.current, secondary: row.previous }))} />
    <p>En la comparación, la primera barra corresponde a la semana del último día seleccionado y la segunda a la semana anterior. Solo órdenes normales.</p>
    <div className="op-table"><table><caption>Cierres reales por semana dentro del rango</caption>
      <thead><tr><th scope="col">Semana del</th><th scope="col">Mecánico</th><th scope="col">Cierres</th></tr></thead>
      <tbody>{report.closureWeeks.map(row => <tr key={row.mechanic + row.week}>
        <td>{dateLabel(row.week)}</td><td>{report.mechanics.find(person => person.id === row.mechanic)?.name}</td><td>{row.closed}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}

function Trends({ report, from, to }: { report: OperationalReport; from: string; to: string }) {
  const [weekly, setWeekly] = useState(false);
  const days = sumSales(report.workDays, from, to, false);
  const closures = new Map(report.closureDays.map(row => [row.date, row]));
  return <>
    <label>Intervalo de ventas <select value={weekly ? 'week' : 'day'} onChange={event => setWeekly(event.target.value === 'week')}>
      <option value="day">Diario</option><option value="week">Semanal</option>
    </select></label>
    <p>Ventas por fecha de trabajo. Primera barra con IVA, segunda sin IVA.</p>
    <Bars title="Ventas registradas" format={formatCRC} rows={sumSales(report.workDays, from, to, weekly).map(row => ({
      label: dateLabel(row.date), value: row.gross, secondary: row.net,
    }))} />
    <Bars title="Cierres reales por día · solo órdenes normales" rows={days.map(row => ({
      label: dateLabel(row.date), value: closures.get(row.date)?.closed ?? 0,
    }))} />
    <Bars title="Cerradas por mecánico asignado · fecha de trabajo" rows={report.productivity.map(row => ({ label: row.name, value: row.closed }))} />
    <Bars title="Tiempo promedio de apertura a cierre · solo órdenes normales"
      rows={report.closureDays.flatMap(row => row.durationMs === null ? [] : [{ label: dateLabel(row.date), value: row.durationMs / 3_600_000 }])}
      format={value => value.toLocaleString('es-CR', { maximumFractionDigits: 2 }) + ' h'} />
    <p>Tiempo transcurrido entre los registros de apertura y cierre.</p>
    <Bars title="Factura electrónica por fecha de trabajo · requeridas y aún pendientes"
      rows={report.workDays.map(row => ({ label: dateLabel(row.date), value: row.required, secondary: row.pending }))} />
    <p>{report.totals.oldestPendingDays === null ? 'Sin facturas pendientes.'
      : 'Pendiente más antigua: ' + report.totals.oldestPendingDays + ' días desde la fecha de trabajo.'}</p>
  </>;
}

type Selection = { status: 'OPEN' | 'CLOSED'; mechanic?: string };
function Orders({ query, selected, close }: { query: string; selected: Selection; close: () => void }) {
  const [page, setPage] = useState(0);
  const params = new URLSearchParams(query);
  params.set('status', selected.status);
  params.set('page', String(page));
  if (selected.mechanic) params.set('mechanic', selected.mechanic);
  const { data, error, retry } = useReport<OperationalOrderPage>(endpoint + '/orders?' + params);
  return <section className="op-block">
    <h3>Órdenes {selected.status === 'CLOSED' ? 'cerradas' : 'abiertas'} por fecha de trabajo</h3>
    <button className="quiet" onClick={close}>Cerrar listado</button>
    {!data ? <Status error={error} retry={retry} /> : !data.rows.length ? <p>Sin órdenes en esta página.</p> : <div className="op-table">
      <table><thead><tr>{['Orden', 'Trabajo', 'Cliente', 'Placa', 'Servicios', 'Con IVA', 'Sin IVA'].map(label =>
        <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.id}>
        <th scope="row"><a target="_blank" rel="noopener noreferrer" href={'?operationalOrder=' + row.id}>{row.orderNumber}</a></th>
        <td>{dateLabel(row.workDate)}{row.backfilled && <small> · Retroactiva</small>}</td>
        <td>{row.customer || '—'}</td><td>{row.plate || '—'}</td><td>{row.services}</td>
        <td>{formatCRC(row.gross)}</td><td>{formatCRC(row.net)}</td>
      </tr>)}</tbody></table>
    </div>}
    {page > 0 && <button className="quiet" onClick={() => setPage(value => value - 1)}>Anterior</button>}
    {data?.more && <button className="quiet" onClick={() => setPage(value => value + 1)}>Siguiente</button>}
  </section>;
}

const tabs = ['Negocio', 'Mecánicos', 'Tendencias'] as const;
export function OperationalDashboard() {
  const [tab, setTab] = useState<typeof tabs[number]>('Negocio');
  const [preset, setPreset] = useState<Preset>('week');
  const [custom, setCustom] = useState(() => period('week'));
  const [mechanic, setMechanic] = useState('');
  const [roster, setRoster] = useState<OperationalReport['mechanics']>([]);
  const [includeBackfilled, setIncludeBackfilled] = useState(false);
  const [selection, setSelection] = useState<Selection>();
  const today = costaRicaToday();
  const { from, to } = preset === 'custom' ? custom : period(preset, today);
  const valid = !!from && !!to && from >= '1900-01-01' && from <= to && to <= today && to <= shiftDate(from, 365);
  const query = new URLSearchParams({ from, to, includeBackfilled: String(includeBackfilled) });
  if (mechanic) query.set('mechanic', mechanic);
  const { data, error, retry } = useReport<OperationalReport>(valid ? endpoint + '?' + query : null);
  useEffect(() => { if (data) setRoster(data.mechanics); }, [data]);
  const open = (status: Selection['status'], id?: string) => setSelection({ status, mechanic: id });
  return <section className="card op-dashboard">
    <h2>Panel operativo</h2>
    <div className="op-filters">
      <label>Período<select value={preset} onChange={event => { setPreset(event.target.value as Preset); setSelection(undefined); }}>
        {Object.entries(presets).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {preset === 'custom' && <>
        <label>Desde<input type="date" min="1900-01-01" max={today} value={from} onChange={event => { setCustom({ from: event.target.value, to }); setSelection(undefined); }} /></label>
        <label>Hasta<input type="date" min={from} max={today} value={to} onChange={event => { setCustom({ from, to: event.target.value }); setSelection(undefined); }} /></label>
      </>}
      <label>Mecánico asignado<select value={mechanic} onChange={event => { setMechanic(event.target.value); setSelection(undefined); }}>
        <option value="">Todos</option>{roster.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      <label className="op-check"><input type="checkbox" checked={includeBackfilled} onChange={event => { setIncludeBackfilled(event.target.checked); setSelection(undefined); }} /> Incluir órdenes retroactivas</label>
    </div>
    {valid && <p>{dateLabel(from)} – {dateLabel(to)} · Costa Rica · Semana de lunes a domingo</p>}
    <p>Ventas, servicios y estados por fecha de trabajo. Los cierres reales usan la hora local de cierre y solo incluyen órdenes normales.</p>
    <nav className="op-tabs" aria-label="Vistas del panel">{tabs.map(label =>
      <button className={tab === label ? '' : 'quiet'} type="button" key={label} aria-pressed={tab === label} onClick={() => { setTab(label); setSelection(undefined); }}>{label}</button>)}</nav>
    {!valid ? <p role="alert">Elegí un rango válido de hasta 366 días, sin fechas futuras.</p> :
      !data ? <Status error={error} retry={retry} /> : <>
      {tab === 'Negocio' && <Business report={data} onOrders={open} />}
      {tab === 'Mecánicos' && <Mechanics report={data} onOrders={open} />}
      {tab === 'Tendencias' && <Trends report={data} from={from} to={to} />}
      {selection && <Orders key={query.toString() + selection.status + selection.mechanic} query={query.toString()} selected={selection} close={() => setSelection(undefined)} />}
    </>}
  </section>;
}
