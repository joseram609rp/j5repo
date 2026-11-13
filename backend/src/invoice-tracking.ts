import { z } from 'zod';
import { HttpError } from './reliability.js';
import type { InvoiceCursor, InvoiceFilters } from './invoice-types.js';

const workDate = z.iso.date().refine(value => !value.startsWith('0000'));
const field = z.string().trim().max(64);
const filtersSchema = z.object({
  plate: field.transform(value => value.toUpperCase().replace(/[\s-]/g, '')).optional(),
  identification: field.optional(),
  orderNumber: field.transform(value => value.toUpperCase()).optional(),
  from: workDate.optional(),
  to: workDate.optional(),
});

export function invoiceSearch(params: URLSearchParams) {
  const fields = Object.fromEntries(params);
  const state = z.enum(['pending', 'issued']).parse(fields.state ?? 'pending');
  const filters: InvoiceFilters = filtersSchema.parse(fields);
  if (filters.from && filters.to && filters.from > filters.to)
    throw new HttpError(400, 'INVALID_DATE_RANGE');
  if (state === 'issued' && !Object.values(filters).some(Boolean))
    throw new HttpError(400, 'INVOICE_SEARCH_REQUIRED');
  const cursor: InvoiceCursor | undefined = fields.afterDate !== undefined || fields.afterId !== undefined
    ? { date: workDate.parse(fields.afterDate), id: z.uuid().parse(fields.afterId) }
    : undefined;
  return { state, filters, cursor };
}

export const invoiceUpdate = z.object({
  issued: z.boolean(),
  orderVersion: z.string().regex(/^[0-9a-f]{16}$/),
}).strict();

export function invoiceVersion(header: string | null) {
  if (header === null) throw new HttpError(428, 'VERSION_REQUIRED');
  if (header === '"none"') return null;
  const version = /^"([0-9a-f]{16})"$/.exec(header)?.[1];
  if (!version) throw new HttpError(400, 'INVALID_INPUT');
  return version;
}
