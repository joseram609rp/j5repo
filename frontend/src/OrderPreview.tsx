import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { amounts } from '../../backend/src/validation';
import type { Draft } from './autosave';
import { formatCRC, formatRegistrationDate, formatWorkDate } from './form-validation';

const paymentLabels: Record<NonNullable<Draft['paymentMethod']>, string> = {
  CASH: 'Efectivo',
  SINPE: 'SINPE',
  CREDIT_CARD: 'Tarjeta de crédito',
  DEBIT_CARD: 'Tarjeta de débito',
  BANK_TRANSFER: 'Transferencia bancaria',
};

export function OrderPreview({ draft, mechanicName, businessDate, taxRate, busy, stale, pending, children, persistedAmounts, onEdit, onConfirm }: {
  draft: Draft;
  mechanicName: string;
  businessDate?: string;
  taxRate: number;
  busy?: boolean;
  stale?: boolean;
  pending?: boolean;
  children?: ReactNode;
  persistedAmounts?: { subtotal?: number; tax?: number; total?: number };
  onEdit: () => void;
  onConfirm?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus(); }, []);
  const date = draft.workDate ?? businessDate;
  const calculated = amounts(draft.items, taxRate);
  const totals = {
    subtotal: persistedAmounts?.subtotal ?? calculated.subtotal,
    tax: persistedAmounts?.tax ?? calculated.tax,
    total: persistedAmounts?.total ?? calculated.total,
  };

  return (
    <section className="order-preview" aria-labelledby="order-preview-title" aria-busy={busy}>
      <div className="order-preview__heading">
        <img src="/logo.png" alt="J5 Frenos La Bandera" width="72" height="72" />
        <div>
          <h2 id="order-preview-title" ref={heading} tabIndex={-1}>Vista previa de orden</h2>
          <p>Resumen para revisión. No es un comprobante fiscal ni una factura electrónica.</p>
        </div>
      </div>
      {stale && !busy && <p className="confirmation" role="alert">
        La orden cambió desde que abriste la vista previa. Vuelve al formulario y abre una nueva vista previa para revisar los datos antes de cerrar.
      </p>}
      <dl className="order-preview__details">
        <div><dt>Mecánico</dt><dd>{mechanicName}</dd></div>
        <div><dt>Cliente</dt><dd>{draft.customerName}</dd></div>
        <div><dt>Placa y vehículo</dt><dd>{draft.plate} · {draft.make} {draft.model} {draft.year}</dd></div>
        <div><dt>{draft.workDate !== undefined ? 'Fecha del trabajo' : 'Fecha de la orden'}</dt>
          <dd>{date ? <time dateTime={date}>{formatWorkDate(date)}</time> : formatRegistrationDate(new Date().toISOString())}</dd>
        </div>
        <div><dt>Método de pago</dt><dd>{draft.paymentMethod && paymentLabels[draft.paymentMethod]}</dd></div>
        <div><dt>Requiere factura electrónica</dt><dd>{draft.electronicInvoice === true ? 'Sí' : 'No'}</dd></div>
      </dl>
      <table className="order-preview__items">
        <caption>Trabajos realizados</caption>
        <thead><tr><th scope="col">Servicio</th><th scope="col">Precio</th></tr></thead>
        <tbody>{draft.items?.map((item, index) => (
          <tr key={index}><td>{item.description}</td><td>{formatCRC(item.price)}</td></tr>
        ))}</tbody>
      </table>
      <dl className="order-preview__totals">
        {draft.electronicInvoice === true && <>
          <div><dt>Subtotal</dt><dd>{formatCRC(totals.subtotal)}</dd></div>
          <div><dt>IVA {taxRate}%</dt><dd>{formatCRC(totals.tax)}</dd></div>
        </>}
        <div className="order-preview__total"><dt>Total</dt><dd>{formatCRC(draft.electronicInvoice === true ? totals.total : totals.subtotal)}</dd></div>
      </dl>
      {!stale && !pending && children}
      <div className="order-preview__actions">
        <button type="button" className="quiet" disabled={busy || pending} onClick={onEdit}>{onConfirm ? 'Volver a editar' : 'Volver al detalle'}</button>
        {onConfirm && <button type="button" disabled={busy || stale} onClick={onConfirm}>
          {busy ? 'Procesando…' : pending ? 'Recuperar resultado del cierre' : 'Confirmar y cerrar orden'}
        </button>}
      </div>
    </section>
  );
}
