import { z } from 'zod';
import { HttpError } from './reliability.js';

const dayMs = 86_400_000;
const date = z.iso.date().min(10).refine(value => value >= '1900-01-01' && value <= '9998-12-31');
const filtersSchema = z.object({
  from: date,
  to: date,
  mechanic: z.uuid().optional(),
  includeBackfilled: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
});
const pageSchema = z.object({
  page: z.coerce.number().int().min(0).max(199).default(0),
  status: z.enum(['OPEN', 'CLOSED']).default('CLOSED'),
});

export function operationalFilters(params: URLSearchParams, now: number) {
  const filters = filtersSchema.parse(Object.fromEntries(params));
  const today = new Date(now - 6 * 3_600_000).toISOString().slice(0, 10);
  if (filters.to < filters.from || filters.to > today ||
      Date.parse(filters.to) - Date.parse(filters.from) >= 366 * dayMs)
    throw new HttpError(400, 'INVALID_DATE_RANGE');
  return filters;
}

export function operationalPage(params: URLSearchParams) {
  return pageSchema.parse(Object.fromEntries(params));
}
