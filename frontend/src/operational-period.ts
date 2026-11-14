export const presets = {
  today: 'Hoy', yesterday: 'Ayer', week: 'Esta semana',
  lastWeek: 'Semana anterior', month: 'Este mes', custom: 'Rango personalizado',
};
export type Preset = keyof typeof presets;
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
export const monday = (date: string) => shiftDate(date, -(new Date(date).getUTCDay() + 6) % 7);
export const costaRicaToday = (now = Date.now()) => new Date(now - 21_600_000).toISOString().slice(0, 10);

export function period(preset: Exclude<Preset, 'custom'>, today = costaRicaToday()) {
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: shiftDate(today, -1), to: shiftDate(today, -1) };
    case 'lastWeek': return { from: shiftDate(monday(today), -7), to: shiftDate(monday(today), -1) };
    case 'month': return { from: today.slice(0, 7) + '-01', to: today };
    case 'week': return { from: monday(today), to: today };
  }
}

export function sumSales<T extends { date: string; gross: number; net: number }>(rows: T[], from: string, to: string, weekly: boolean) {
  const values = new Map(rows.map(row => [row.date, row]));
  const buckets = new Map<string, { date: string; gross: number; net: number }>();
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const key = weekly ? monday(date) : date;
    const bucket = buckets.get(key) ?? { date: key, gross: 0, net: 0 };
    const row = values.get(date);
    bucket.gross += Math.round((row?.gross ?? 0) * 100);
    bucket.net += Math.round((row?.net ?? 0) * 100);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(row => ({ ...row, gross: row.gross / 100, net: row.net / 100 }));
}
