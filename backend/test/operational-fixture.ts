import type { OperationalOrder, OperationalReport, OperationalTotals } from '../src/operational-types.js';

export const mechanic = { id: '11111111-1111-4111-8111-111111111111', name: 'Mecánico de prueba' };
export const sampleOrder: OperationalOrder = {
  id: '22222222-2222-4222-8222-222222222222', orderNumber: 'OT-QA-01',
  workDate: '2026-11-13', customer: 'Cliente de prueba', plate: 'QAA123', status: 'CLOSED',
  backfilled: false, services: 2, gross: 11300.09, net: 10000.08,
};
export const metrics: OperationalTotals = {
  closed: 1, open: 0, gross: sampleOrder.gross, net: sampleOrder.net, tax: 1300.01,
  services: 2, pending: 1, required: 1, oldestPendingDays: 0,
};
export function sampleReport(date = sampleOrder.workDate): OperationalReport {
  return {
    totals: metrics, mechanics: [mechanic], productivity: [{ ...mechanic, ...metrics }],
    workDays: [{ ...metrics, date }], payments: [{ method: 'SINPE', gross: metrics.gross, closed: 1 }],
    closureDays: [{ date, closed: 1, durationMs: 7_200_000 }],
    closureByMechanicDay: [{ mechanic: mechanic.id, date, closed: 1 }],
    closureWeeks: [{ mechanic: mechanic.id, week: date, closed: 1 }],
    comparison: [{ mechanic: mechanic.id, current: 1, previous: 0 }],
    comparisonWeek: date, comparisonThrough: date,
  };
}
