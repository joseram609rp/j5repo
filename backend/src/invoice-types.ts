export type InvoiceState = 'pending' | 'issued';

export type InvoiceFilters = {
  plate?: string;
  identification?: string;
  orderNumber?: string;
  from?: string;
  to?: string;
};

export type InvoiceCursor = { date: string; id: string };

export type InvoiceEntry = {
  id: string;
  orderNumber: string;
  customer: string;
  identification: string | null;
  plate: string;
  make: string | null;
  model: string | null;
  date: string;
  total: number;
  version: string | null;
  orderVersion: string;
};

export type InvoicePage = { entries: InvoiceEntry[]; next: InvoiceCursor | null };

export const INVOICE_PAGE_SIZE = 25;
