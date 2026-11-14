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
    await act(async () => root.render(<OperationalDashboard />));
    expect(container.querySelector('[role=alert]')).not.toBeNull();
    await click('Reintentar');
    expect(container.textContent).toContain('Ventas registradas sin IVA');
    expect(vi.mocked(api).mock.lastCall?.[0]).toContain('includeBackfilled=false');
    await act(async () => container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await click('Mecánicos');
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Cerradas de Mecánico de prueba"]')!.click());
    expect(vi.mocked(api).mock.lastCall?.[0]).toContain('includeBackfilled=true&status=CLOSED&page=0&mechanic=' + mechanic.id);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('?operationalOrder=' + sampleOrder.id);
    expect(vi.mocked(api).mock.calls.every(([, options]) => !options?.method)).toBe(true);
    await click('Tendencias');
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  }
});
