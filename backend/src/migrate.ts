import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SqlRepository } from './sql.js';

async function migrate() {
  const directory = fileURLToPath(new URL('../../database/migrations/', import.meta.url));
  const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(async name => {
    const text = await readFile(directory + '/' + name, 'utf8');
    return { name, text, checksum: createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex') };
  }));
  const applied = await new SqlRepository().runSql(async tx => {
    await tx.query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'j5:schema',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=4000; IF @r<0 THROW 51000,'Migration lock unavailable',1;");
    await tx.query("IF OBJECT_ID(N'dbo.SchemaMigrations',N'U') IS NULL CREATE TABLE dbo.SchemaMigrations(name nvarchar(200) NOT NULL PRIMARY KEY,checksum char(64) NOT NULL,applied_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());");
    const rows = (await tx.query<{ name: string; checksum: string }>('SELECT name,checksum FROM dbo.SchemaMigrations')).recordset;
    for (const old of rows) if (!migrations.some(m => m.name === old.name && m.checksum === old.checksum)) throw new Error('MIGRATION_HISTORY_MISMATCH');
    const changed: string[] = [];
    for (const migration of migrations) {
      if (rows.some(row => row.name === migration.name)) continue;
      await tx.query(migration.text);
      await tx.query('INSERT dbo.SchemaMigrations(name,checksum) VALUES(@name,@checksum)', { name: migration.name, checksum: migration.checksum });
      changed.push(migration.name);
    }
    return changed;
  });
  console.log(applied.length ? 'Migraciones aplicadas: ' + applied.join(', ') : 'Esquema actualizado; sin cambios.');
}
migrate().catch(() => {
  console.error('Migración fallida. Revisa configuración, conectividad, permisos y compatibilidad del esquema; no se eliminaron tablas. No se muestran errores del driver para proteger secretos.');
  process.exitCode = 1;
});
