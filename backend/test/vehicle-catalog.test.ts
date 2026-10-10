import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
it('migration seed is reproducible from approved JSON and preserves legacy migrations',()=>{
 execFileSync(process.execPath,['scripts/generate-vehicle-catalog-sql.mjs','--check']);
 const source=JSON.parse(readFileSync('data/vehicle-catalog/vehicle_catalog_final.json','utf8'));
 expect(source.brands).toHaveLength(57); expect(source.brands.reduce((n:number,b:{models:string[]})=>n+b.models.length,0)).toBe(986);
 const migration=readFileSync('database/migrations/010_vehicle_catalog.sql','utf8');
 expect(migration).toContain('Latin1_General_100_CI_AI');expect(migration).toContain('FK_VehicleModels_Make');expect(migration).toContain('CATALOG_SEED_INVALID');
 expect(migration).not.toMatch(/ALTER TABLE dbo.Vehicles|https?:/);
 const cleanup=readFileSync('clean up/02_cleanup_qa.sql','utf8');
 expect(cleanup).toContain('CATALOG_CHANGED');expect(cleanup).not.toMatch(/(?:DELETE FROM|TRUNCATE TABLE|DROP TABLE) dbo.Vehicle(?:Makes|Models)/);
});
