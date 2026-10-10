# Integración catálogo runtime — 2026-10-09

Repositorio: C:\j5repo. Branch inicial/final: feature/orders-mvp. HEAD sin cambios: 1e4884893791822b9b9f01f222d247e0b01fe330. Estado inicial limpio; cambios finales sin stage/commit/push/merge.

## Resultado
010_vehicle_catalog.sql aplicada a tallerj5. Primer intento falló; preflight confirmó conectividad y 9 migraciones, reintento aplicó 010. db:verify final pasó: VehicleMakes=57, VehicleModels=986, duplicates=0, orphans=0; SchemaMigrations=10.

Tablas con int IDENTITY, PK, nombres nvarchar(100/150), normalized_name computed/persisted con trim y Latin1_General_100_CI_AI, active y created_at. Índices únicos por nombre normalizado y (make_id,normalized_name); FK únicamente VehicleModels -> VehicleMakes. Vehicles mantiene texto libre. Generador determinista desde JSON aprobado con SHA256 y --check; runner aplica en transacción con checksum. 001–009 intactas, sin provenance en SQL.

GET /api/vehicle-catalog autenticado, respuesta completa y no-store; no renueva idle session. Errores claros para catálogo ausente/inconsistente. SQL conserva retrySql.

Cache independiente en IndexedDB j5-vehicle-catalog, schema 1, fetchedAt y payload; TTL 7 días. Memoria compartida, fetch deduplicado, cache inmediato y refresh stale en background. Fallos de red o storage nunca bloquean formulario ni órdenes. Retry específico dentro de api(): hasta 4 intentos, timeout por intento 6 s, presupuesto global 30 s, backoff 1/2/4 s + jitter y Retry-After; solo errores transitorios. Mutaciones conservan su política.

Autocomplete desde 1 carácter, substring insensible a case/acentos y prioridad prefix, hasta 10 resultados, scroll, teclado/flechas/Enter/Escape y pointer. Modelo por marca exacta normalizada. Texto custom siempre permitido; selección pasa por edit/autosave y nunca cambia el otro campo silenciosamente.

## Cleanup
01_precheck.sql y 03_postcheck.sql muestran catálogo, comprueban 57/986, cero huérfanos y migración 010. 02_cleanup_qa.sql espera ambas tablas y 10 migraciones; NO borra catálogo, bloquea y toma snapshots completos, compara ambos sentidos antes del commit. README actualizado. ADMIN y comportamiento de reset QA de OrderNumber permanecen. Runner no tiene otra lista de schema que modificar. NO se ejecutó cleanup.

## Verificación
- pnpm check: OK, 204 tests locales, typecheck y build. 17 tests SQL omitidos en ejecución local y ejecutados por separado.
- pnpm test:sql: OK, 17/17 tests SQL con fixtures rollback. Primer pase encontró el bug de orden de trabajos descrito abajo; segundo pase completo pasó.
- pnpm db:migrate: OK al reintentar.
- pnpm --filter @j5/backend db:verify: OK antes y después de suites SQL.
- node scripts/generate-vehicle-catalog-sql.mjs --check: OK.
- git diff --check: OK.
- .env ignorado, no tracked ni staged. Sin cambios a CarsXE key ni llamadas CarsXE.
- precheck de solo lectura final: 57/986; órdenes, trabajos, clientes, vehículos y recibos = 0; ADMIN=1; sesión=1 y auditoría=1.
- postcheck QA adicional devolvió SQL 51106 porque exige sesiones/auditoría vacías. No se borraron esos registros. No es fallo de catálogo ni db:verify.

## Bug encontrado y corregido
OrderItems se leía por UUID aleatorio, regenerado al guardar; reabrir podía reordenar trabajos y fallar la comparación histórica. Ahora la lectura conserva el orden del draft persistido, tomando siempre los valores SQL y reteniendo duplicados/fallback para datos legacy. Test unitario y suite SQL de cierre/reapertura pasan.

Las suites existentes consumen valores de OrderNumber aunque hagan rollback de fixtures (las secuencias SQL no revierten sus números). Valor final observado: 143. No se reinició la secuencia ni se ejecutó cleanup.
