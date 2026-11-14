import { mechanic, metrics, sampleOrder, sampleReport } from './operational-fixture.js';

export function operationalPreview() {
  const session = {
    userId: mechanic.id, username: 'demo', fullName: 'Administrador de prueba', role: 'ADMIN',
    csrf: 'qa', idleMs: 7_200_000,
  };
  const response = (body: unknown, status = 200) => Response.json(body, { status });
  return async (request: Request) => {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === '/api/auth/activity') return response({ lastActivity: Date.now() });
    if (request.method !== 'GET') return response({ code: 'READ_ONLY' }, 405);
    if (pathname === '/api/auth/me') return response({ ...session, role: process.env.J5_OPERATIONAL_PREVIEW === 'mechanic' ? 'MECHANIC' : 'ADMIN', lastActivity: Date.now() });
    if (pathname === '/api/health') return response({ ok: true });
    if (pathname === '/api/admin/invoice-tracking/count') return response({ count: 1 });
    const date = searchParams.get('to') ?? new Date(Date.now() - 21_600_000).toISOString().slice(0, 10);
    if (pathname === '/api/admin/operational') {
      const base = sampleReport(date);
      const monday = new Date(Date.parse(date) - ((new Date(date).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0,10);
      return response({
        ...base, comparisonWeek: monday, closureWeeks: [{ mechanic: mechanic.id, week: monday, closed: 1 }],
      } satisfies ReturnType<typeof sampleReport>);
    }
    if (pathname === '/api/admin/operational/orders') return response({
      rows: searchParams.get('status') === 'OPEN' ? [] : [{ ...sampleOrder, workDate: date }], more: false,
    });
    if (pathname === '/api/admin/operational/orders/' + sampleOrder.id) return response({
      id: sampleOrder.id, orderDate: date, displayOrderId: sampleOrder.orderNumber, status: 'CLOSED',
      mechanicId: mechanic.id, mechanicName: mechanic.name, version: '0000000000000001',
      totalAmount: metrics.gross, taxAmount: metrics.tax, subtotalAmount: metrics.net, taxRate: 13,
      draft: {
        customerName: sampleOrder.customer, plate: sampleOrder.plate, mileage: 72000,
        paymentMethod: 'SINPE', electronicInvoice: true,
        items: [{ description: 'Inspección de frenos', price: 5000.07 }, { description: 'Ajuste', price: 5000.01 }],
      },
    });
    return response({ code: 'NOT_FOUND' }, 404);
  };
}
