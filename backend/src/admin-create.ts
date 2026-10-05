import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { passwordSchema, usernameSchema } from './domain.js';
import { fullNameSchema } from './validation.js';
import { hashPassword } from './password.js';
import { HttpError } from './reliability.js';
import { SqlRepository } from './sql.js';

async function main() {
  if (await new SqlRepository().run(async tx => (await tx.users()).some(u => u.active && u.role === 'ADMIN'))) { console.log('Ya existe un ADMIN activo; no se creó otro.'); return; }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('TTY_REQUIRED');
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  let fullName: string; let username: string; let password: string;
  try {
    const nameInput = fullNameSchema.safeParse(await rl.question('Nombre completo: '));
    if (!nameInput.success) throw new Error('INVALID_FULL_NAME');
    fullName = nameInput.data;
    const usernameInput = usernameSchema.safeParse(await rl.question('Usuario del primer ADMIN: '));
    if (!usernameInput.success) throw new Error('INVALID_USERNAME');
    username = usernameInput.data;
    process.stdout.write('Contraseña (12 caracteres mínimo, 72 bytes máximo; entrada oculta): ');
    hidden = true;
    password = await rl.question('');
    if (!passwordSchema.safeParse(password).success) throw new Error('INVALID_PASSWORD');
    process.stdout.write('\nConfirmar contraseña: ');
    const confirm = await rl.question('');
    if (password !== confirm) throw new Error('PASSWORD_MISMATCH');
  } finally { hidden = false; rl.close(); process.stdout.write('\n'); }
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  await new SqlRepository().run(async tx => {
    // Full range lock prevents two concurrent bootstrap administrators.
    const users = await tx.users();
    if (users.some(u => u.id === id)) return; // ambiguous commit replay
    if (users.some(u => u.role === 'ADMIN' && u.active)) throw new HttpError(409, 'ADMIN_ALREADY_EXISTS');
    if (users.some(u => u.username === username)) throw new HttpError(409, 'USERNAME_EXISTS');
    await tx.insertUser({ id, username, fullName, passwordHash, role: 'ADMIN', active: true });
    await tx.audit(id, 'ADMIN_BOOTSTRAPPED', id);
  });
  console.log('Primer administrador creado.');
}
main().catch(error => {
  const messages: Record<string,string> = {
    TTY_REQUIRED: 'Ejecuta este comando en una terminal interactiva.',
    INVALID_FULL_NAME: 'Nombre completo requerido: entre 1 y 200 caracteres, sin quedar vacío al quitar espacios.',
    INVALID_USERNAME: 'Usuario inválido: usa entre 3 y 64 caracteres; letras, números, punto, guion o guion bajo.',
    INVALID_PASSWORD: 'Contraseña inválida: debe tener al menos 12 caracteres y como máximo 72 bytes UTF-8. No se creó el administrador.',
    PASSWORD_MISMATCH: 'Las contraseñas no coinciden. No se creó el administrador.',
    ADMIN_ALREADY_EXISTS: 'Ya existe un ADMIN activo; no se creó otro.',
    USERNAME_EXISTS: 'Ese usuario ya existe; elige otro.',
    SQL_UNAVAILABLE: 'SQL no respondió dentro del tiempo permitido. Reintenta el comando.',
    SQL_NOT_CONFIGURED: 'Falta configurar SQL en el .env local.'
  };
  // Only fixed messages and numeric SQL codes are safe to display; never driver messages or input.
  const code = error instanceof HttpError ? error.code : error?.message;
  console.error(messages[code] ?? (typeof error?.number === 'number' ? 'No se pudo crear el administrador (código SQL '+error.number+'). No se muestran datos de conexión.' : 'No se pudo crear el administrador. Revisa .env, migraciones y conexión SQL.'));
  process.exitCode = 1;
});
