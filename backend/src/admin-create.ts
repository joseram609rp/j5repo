import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { passwordSchema, usernameSchema } from './domain.js';
import { hashPassword } from './password.js';
import { HttpError } from './reliability.js';
import { SqlRepository } from './sql.js';

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('TTY_REQUIRED');
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  let username: string; let password: string;
  try {
    username = usernameSchema.parse(await rl.question('Usuario del primer ADMIN: '));
    process.stdout.write('Contraseña (12 caracteres mínimo, 72 bytes máximo; entrada oculta): ');
    hidden = true;
    password = await rl.question('');
    process.stdout.write('\nConfirmar contraseña: ');
    const confirm = await rl.question('');
    if (password !== confirm) throw new Error('PASSWORD_MISMATCH');
    passwordSchema.parse(password);
  } finally { hidden = false; rl.close(); process.stdout.write('\n'); }
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  await new SqlRepository().run(async tx => {
    // Full range lock prevents two concurrent bootstrap administrators.
    const users = await tx.users();
    if (users.some(u => u.id === id)) return; // ambiguous commit replay
    if (users.some(u => u.role === 'ADMIN' && u.active)) throw new HttpError(409, 'ADMIN_ALREADY_EXISTS');
    if (users.some(u => u.username === username)) throw new HttpError(409, 'USERNAME_EXISTS');
    await tx.insertUser({ id, username, passwordHash, role: 'ADMIN', active: true });
    await tx.audit(id, 'ADMIN_BOOTSTRAPPED', id);
  });
  console.log('Primer administrador creado.');
}
main().catch(error => {
  const known = ['TTY_REQUIRED', 'PASSWORD_MISMATCH', 'ADMIN_ALREADY_EXISTS', 'USERNAME_EXISTS'];
  console.error(known.includes(error?.message) ? error.message : 'No se pudo crear el administrador. Revisa la entrada, .env, migraciones y conexión SQL.');
  process.exitCode = 1;
});
