// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { sampleOrder, sampleReport, mechanic } from '../../backend/test/operational-fixture';
import { api, ApiError } from './api';
import { OperationalDashboard } from './OperationalDashboard';

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), api: vi.fn() }));

it('retries a failed report, keeps filters across tabs and opens the matching read-only drilldown', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const click = (label: string) => act(async () => {
    [...container.querySelectorAll('button')].find(button => button.textContent === label)!.click();
  });
  vi.mocked(api).mockImplementation(async path => (path.includes('/orders?')
    ? { rows: [sampleOrder], more: false } : sampleReport()) as never)
    .mockRejectedValueOnce(new ApiError(500, 'UNAVAILABLE'));
  try {
    await act(async () => root.render(<OperationalDashboard onPendingInvoices={vi.fn()} />));
    expect(container.querySelector('[role=alert]')).not.toBeNull();
    await click('Reintentar');
    expect(container.textContent).toContain('Ventas registradas sin IVA');
    expect(container.textContent).toContain('Ítems en las órdenes cerradas');
    expect(container.textContent).not.toContain('Ticket promedio');
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
    expect(container.querySelectorAll('select')).toHaveLength(1);
    const closed = container.querySelector<HTMLButtonElement>('button[aria-label="Ver 1 órdenes cerradas"]')!;
    await act(async () => closed.click());
    expect(document.activeElement?.textContent).toBe('Órdenes cerradas por fecha de trabajo');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('?operationalOrder=' + sampleOrder.id);
    await click('Cerrar listado');
    expect(container.querySelector('[aria-label$="órdenes abiertas"]')).toBeNull();
    await click('Mecánicos');
    expect(container.querySelector('[aria-label="Abiertas de Mecánico de prueba"]')).toBeNull();
    await act(async () => {
      const select = container.querySelectorAll('select')[1]!;
      select.value = mechanic.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(vi.mocked(api).mock.lastCall?.[0]).toContain('mechanic=' + mechanic.id);
    await click('Negocio');
    expect(vi.mocked(api).mock.lastCall?.[0]).not.toContain('mechanic=');
    expect(container.querySelectorAll('select')).toHaveLength(1);
    await click('Mecánicos');
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Cerradas de Mecánico de prueba"]')!.click());
    expect(vi.mocked(api).mock.lastCall?.[0]).toContain('status=CLOSED&page=0');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('?operationalOrder=' + sampleOrder.id);
    expect(vi.mocked(api).mock.calls.every(([, options]) => !options?.method)).toBe(true);
    await click('Tendencias');
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
    expect(vi.mocked(api).mock.lastCall?.[0]).toContain('mechanic=' + mechanic.id);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  }
});
