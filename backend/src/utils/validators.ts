import { z } from 'zod';

/** Accepts 9876543210, 09876543210, 919876543210 or +919876543210 and normalises to +919876543210. */
export const indianPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^(\+91|91|0)?[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number')
  .transform((v) => `+91${v.slice(-10)}`);

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const personName = z
  .string()
  .trim()
  .min(2, 'Name is too short')
  .max(120)
  .regex(/^[\p{L} .'-]+$/u, 'Name contains invalid characters');
export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode');
export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);
export const uuid = z.string().uuid('Invalid id');
export const idParam = z.object({ id: uuid });
export const time24 = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Query-string boolean: "true"/"1" -> true, "false"/"0" -> false. */
export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

export function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}
