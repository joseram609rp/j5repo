import { describe, expect, it } from 'vitest';
import { costaRicaToday, period, sumSales } from './operational-period';

describe('períodos operativos', () => {
  it('usa medianoche de Costa Rica y semanas de lunes a domingo entre años', () => {
    expect(costaRicaToday(Date.parse('2026-01-05T05:59:59Z'))).toBe('2026-01-04');
    expect(costaRicaToday(Date.parse('2026-01-05T06:00:00Z'))).toBe('2026-01-05');
    expect(period('week', '2026-01-04')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
    expect(period('lastWeek', '2026-01-05')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
    expect(period('yesterday', '2026-01-01')).toEqual({ from: '2025-12-31', to: '2025-12-31' });
  });

  it('rellena fechas vacías y suma centavos por semana sin incluir días fuera del rango', () => {
    const sales = [
      { date: '2026-01-03', gross: 1, net: 1 },
      { date: '2026-01-04', gross: 0.3, net: 0.26 },
      { date: '2026-01-05', gross: 0.1, net: 0.09 },
      { date: '2026-01-06', gross: 0.2, net: 0.17 },
    ];
    expect(sumSales(sales, '2026-01-04', '2026-01-07', true)).toEqual([
      { date: '2025-12-29', gross: 0.3, net: 0.26 },
      { date: '2026-01-05', gross: 0.3, net: 0.26 },
    ]);
    expect(sumSales(sales, '2026-01-07', '2026-01-07', false)).toEqual([{ date: '2026-01-07', gross: 0, net: 0 }]);
  });
});
