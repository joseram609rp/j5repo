export type OperationalFilters = {
  from: string;
  to: string;
  mechanic?: string;
  includeBackfilled: boolean;
};

export type OperationalTotals = {
  closed: number;
  open: number;
  services: number;
  gross: number;
  net: number;
  tax: number;
  required: number;
  pending: number;
  oldestPendingDays: number | null;
};

export type OperationalMechanic = { id: string; name: string };
export type OperationalReport = {
  totals: OperationalTotals;
  mechanics: OperationalMechanic[];
  productivity: (OperationalTotals & OperationalMechanic)[];
  workDays: (OperationalTotals & { date: string })[];
  payments: { method: string; gross: number; closed: number }[];
  closureDays: { date: string; closed: number; durationMs: number | null }[];
  closureWeeks: { mechanic: string; week: string; closed: number }[];
  comparison: { mechanic: string; current: number; previous: number }[];
  comparisonWeek: string;
  comparisonThrough: string;
};

export type OperationalOrder = {
  id: string;
  orderNumber: string;
  workDate: string;
  customer: string;
  plate: string;
  status: 'OPEN' | 'CLOSED';
  backfilled: boolean;
  services: number;
  gross: number;
  net: number;
};

export type OperationalOrderPage = { rows: OperationalOrder[]; more: boolean };
