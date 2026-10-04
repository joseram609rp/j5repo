import { compare, hash } from 'bcryptjs';
import { passwordSchema } from './domain.js';
// Cost 12; validate byte length explicitly to avoid bcrypt's silent truncation.
export const hashPassword = (password: string) => hash(passwordSchema.parse(password), 12);
// Valid bcrypt hash used only to equalize work for unknown usernames.
const dummy = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
export async function verifyPassword(password: string, stored?: string) {
  const validLength = Buffer.byteLength(password, 'utf8') <= 72;
  const matches = await compare(validLength ? password : '', stored ?? dummy);
  return Boolean(stored) && validLength && matches;
}
