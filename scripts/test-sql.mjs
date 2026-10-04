import { spawnSync } from 'node:child_process';
if (!process.env.SQL_SERVER || !process.env.SQL_DATABASE ||
    ((process.env.SQL_AUTH_MODE ?? 'sql') === 'sql' && (!process.env.SQL_USER || !process.env.SQL_PASSWORD))) {
  console.error('Configura .env y aplica pnpm db:migrate antes de test:sql. No se abrió ninguna conexión.');
  process.exitCode = 1;
} else {
  const child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'backend/test/sql.integration.test.ts'], {
    stdio: 'inherit', env: { ...process.env, J5_SQL_INTEGRATION: '1' }
  });
  process.exitCode = child.status ?? 1;
}
