import { z } from 'zod';
export const fullNameSchema = z.string().trim().min(1).max(200);
export const identificationSchema = z.string().trim().regex(/^\d{9}$/);
export const phoneSchema = z.string().trim().regex(/^\d{8}$/);
export const emailSchema = z.string().trim().toLowerCase().pipe(z.union([z.literal(''), z.email().max(254)]));
export const plateSchema = z.string().transform(s => s.toUpperCase().replace(/[\s-]/g, '')).pipe(z.string().regex(/^[A-Z]{3}\d{3}$/));
export const makeSchema = z.string().trim().min(1).max(100);
export const modelSchema = z.string().trim().min(1).max(100);
export const yearSchema = z.number().int().min(1950).refine(year => year <= new Date().getUTCFullYear() + 1, 'Year exceeds current UTC year + 1');
export const mileageSchema = z.number().int().min(0).max(10_000_000).nullable();
export const itemSchema = z.object({ description: z.string().trim().min(1).max(500), price: z.number().positive().max(9_999_999_999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, 'Use at most two decimal places') }).strict();
export const customerSchema = z.object({ fullName: fullNameSchema, identification: identificationSchema, phone: phoneSchema, email: emailSchema.optional() }).strict();
export const vehicleSchema = z.object({ make: makeSchema, model: modelSchema, year: yearSchema, plate: plateSchema, ownerId: z.uuid() }).strict();
// Blank values survive OPEN autosaves; all nonblank values must be valid.
const blankOr = <T extends z.ZodType>(schema: T) => z.union([z.literal(''), schema]);
export const draftSchema = z.object({
 customerName: blankOr(fullNameSchema), plate: blankOr(plateSchema),
 identification: blankOr(identificationSchema).optional(), phone: blankOr(phoneSchema).optional(), email: emailSchema.optional(),
 make: blankOr(makeSchema).optional(), model: blankOr(modelSchema).optional(), year: yearSchema.nullable().optional(),
 mileage: mileageSchema, notes: z.string().max(5000), recommendations: z.string().max(5000),
 customerId: z.uuid().optional(), vehicleId: z.uuid().optional(), items: z.array(itemSchema).max(100).optional(),
 action: z.enum(['close', 'reopen', 'void', 'admin-edit']).optional()
}).strict().refine(d => (d.items ?? []).reduce((sum, i) => sum + Math.round(i.price * 100), 0) <= 999_999_999_999, 'Total exceeds DECIMAL(12,2)');
export function canClose(d: z.infer<typeof draftSchema>) {
 return d.mileage !== null && !!d.items?.length && d.items.every(i => itemSchema.safeParse(i).success) && customerSchema.safeParse({ fullName: d.customerName, identification: d.identification, phone: d.phone, email: d.email }).success &&
 makeSchema.safeParse(d.make).success && modelSchema.safeParse(d.model).success && mileageSchema.safeParse(d.mileage).success && d.year != null && plateSchema.safeParse(d.plate).success && yearSchema.safeParse(d.year).success;
}
export function totalAmount(items: { price: number }[] = []) { return items.reduce((sum, i) => sum + Math.round(i.price * 100), 0) / 100; }
