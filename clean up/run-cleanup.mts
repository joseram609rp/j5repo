import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { sqlConfig } from '../backend/src/sql.js';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sql = require('mssql') as typeof import('mssql');

const server = 'j5sqlserver.database.windows.net';
const database = 'tallerj5';
const targets = new Set(['OrderItems', 'Orders', 'Vehicles', 'Customers']);
const [mode = 'precheck', baselinePath, evidencePath, confirmation, ...extra] = process.argv.slice(2);
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function triggerHash(migration: string, name: string) {
  const source = read('../database/migrations/' + migration).replace(/\r\n/g, '\n');
  const start = 'CREATE OR ALTER TRIGGER dbo.' + name + ' ';
  const definitions = [...source.matchAll(/EXEC\(N'((?:[^']|'')*)'\);/g)];
  const definition = definitions.find(([, body]) => body.startsWith(start))?.[1];
  if (!definition) throw new Error('REVIEWED_TRIGGER_NOT_FOUND');
  return createHash('sha256').update(definition.slice('CREATE OR ALTER '.length).trim().replace(/''/g, "'"), 'utf16le').digest();
}

type SnapshotRow = { schema_name: string; table_name: string; row_count: string; sha256: string; fk_sha256: string };
const protectedRow = (row: SnapshotRow) => row.schema_name !== 'dbo' || !targets.has(row.table_name);

function baseline() {
  const report = readJson(baselinePath);
  if (report.server !== server || report.database !== database || !Array.isArray(report.rows)
    || !Number.isFinite(Date.parse(report.capturedAt))) throw new Error('INVALID_BASELINE');
  return report as { rows: SnapshotRow[]; capturedAt: string };
}

function checkEvidence(capturedAt: string) {
  const evidence = readJson(evidencePath);
  const stopped = Date.parse(evidence.writesSuspendedAt);
  const restored = Date.parse(evidence.restorePointUtc);
  const expires = Date.parse(evidence.maintenanceExpiresAt);
  const captured = Date.parse(capturedAt);
  const now = Date.now();
  if (evidence.server !== server || evidence.database !== database
    || typeof evidence.azureRestoreOperation !== 'string' || !evidence.azureRestoreOperation.trim()
    || evidence.restoreVerified !== true || evidence.offlineQueuesVerifiedEmpty !== true
    || evidence.writesSuspended !== true || evidence.onlyTestDataVerified !== true
    || evidence.protectedCountsReviewed !== true
    || !(stopped <= captured && captured <= now && stopped <= restored && restored <= now)
    || !(expires > now + 15 * 60_000 && expires <= now + 24 * 60 * 60_000)
  ) throw new Error('RESTORE_AND_MAINTENANCE_EVIDENCE_REQUIRED');
}

const files = { precheck: '01_precheck.sql', cleanup: '02_cleanup.sql', postcheck: '03_postcheck.sql' } as const;
if (!Object.hasOwn(files, mode) || !baselinePath || extra.length
 || (mode === 'cleanup' ? !evidencePath || confirmation !== '--confirm-test-data-delete' : Boolean(evidencePath || confirmation)))
 throw new Error('USAGE: MODE BASELINE_PATH [EVIDENCE_PATH --confirm-test-data-delete]');

if (process.env.SQL_SERVER !== server || process.env.SQL_DATABASE !== database)
 throw new Error('TARGET_MISMATCH');

const previous = mode === 'precheck' ? undefined : baseline();
if (mode === 'cleanup') checkEvidence(previous!.capturedAt);
const pool = new sql.ConnectionPool({ ...sqlConfig(), requestTimeout: 600_000 });

async function query(action: keyof typeof files, rows?: SnapshotRow[]) {
  return pool.request()
    .input('validate', sql.NVarChar(sql.MAX), read('00_validate.sql'))
    .input('snapshot', sql.NVarChar(sql.MAX), read('00_snapshot.sql'))
    .input('triggerParams', sql.NVarChar(200), '@itemsTrigger binary(32),@ordersTrigger binary(32),@numberTrigger binary(32)')
    .input('itemsTrigger', sql.Binary(32), triggerHash('009_order_billing.sql', 'TR_OrderItems_Total'))
    .input('ordersTrigger', sql.Binary(32), triggerHash('015_flexible_order_plate_guard.sql', 'TR_Orders_Guard'))
    .input('numberTrigger', sql.Binary(32), triggerHash('011_daily_order_numbers.sql', 'TR_Orders_DailyNumber'))
    .input('confirm', sql.Bit, action === 'cleanup')
    .input('baseline', sql.NVarChar(sql.MAX), rows ? JSON.stringify(rows) : null)
    .query('SET NOCOUNT ON;\n' + read(files[action]));
}

let cleanupSubmitted = false;
let committed = false;
try {
  await pool.connect();
  if (mode === 'precheck') {
    const capturedAt = new Date().toISOString();
    const result = await query('precheck');
    writeFileSync(baselinePath, JSON.stringify({ server, database, capturedAt, rows: result.recordset }, null, 2), { flag: 'wx' });
    for (const records of result.recordsets as unknown[][]) console.log(JSON.stringify(records));
  } else {
    if (mode === 'cleanup') {
      checkEvidence(previous!.capturedAt);
      cleanupSubmitted = true;
      const result = await query('cleanup', previous!.rows);
      committed = result.recordset[0]?.result === 'CLEANUP_COMMITTED';
      if (!committed) throw new Error('COMMIT_RESULT_MISSING');
      console.log(JSON.stringify(result.recordset));
    }
    const result = await query('postcheck', previous!.rows.filter(protectedRow));
    console.log(JSON.stringify({ result: 'POSTCHECK_OK', tables: result.recordset }));
  }
} catch (error) {
  const number = (error as { number?: number }).number;
  console.error(typeof number === 'number' ? 'SQL error ' + number : 'Cleanup command failed');
  if (committed) console.error('Cleanup committed. Postcheck failed. Keep writes suspended.');
  else if (cleanupSubmitted) console.error('Verify the outcome with postcheck before any retry.');
  process.exitCode = 1;
} finally {
  await pool.close();
}
