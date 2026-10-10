import { spawnSync } from 'node:child_process';
if (
  !process.env.SQL_SERVER ||
  !process.env.SQL_DATABASE ||
  ((process.env.SQL_AUTH_MODE ?? 'sql') === 'sql' &&
    (!process.env.SQL_USER || !process.env.SQL_PASSWORD))
) {
  console.error(
    'Configura .env y aplica pnpm db:migrate antes de test:sql. No se abrió ninguna conexión.',
  );
  process.exitCode = 1;
} else {
  const suites = [
    'backend/test/sql.integration.test.ts',
    'backend/test/orders-sql.integration.test.ts',
  ];
  const selected = process.argv.slice(2);
  if (selected.some((path) => !suites.includes(path)))
    throw new Error('Unknown SQL test suite');
  const child = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--no-file-parallelism',
      ...(selected.length ? selected : suites),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, J5_SQL_INTEGRATION: '1' },
    },
  );
  const secrets = [process.env.SQL_USER, process.env.SQL_PASSWORD].filter(
    Boolean,
  );
  let output = (child.stdout ?? '') + (child.stderr ?? '');
  for (const secret of secrets)
    output = output.split(secret).join('[REDACTED]');
  output = output.replace(
    /(?:Server|Password|User Id)=[^;\r\n]+/gi,
    '[REDACTED]',
  );
  console.log(output);
  process.exitCode = child.status ?? 1;
}
