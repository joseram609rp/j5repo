# Cleanup total de J5 — DEV/QA ONLY
Elimina órdenes/trabajos, clientes, vehículos, sesiones, recibos idempotentes, auditoría y usuarios MECHANIC u otros no ADMIN.
Conserva TODOS los ADMIN activos e inactivos con sus campos intactos, SchemaMigrations y schema/constraints/triggers/índices/secuencia.
No es una migración; no altera migraciones aplicadas. Si aparecen tablas nuevas, aborta hasta revisarlas.

## Prerequisitos
Node soportado, pnpm y dependencias instaladas; .env local ignorado con configuración SQL existente.
Destino exclusivo: j5sqlserver.database.windows.net / tallerj5.
Detenga TODOS los procesos API/frontend y pestañas J5, incluyendo otras máquinas, antes de borrar.
No utilizar en producción. No genera respaldo: recuperación depende del respaldo Azure disponible.

## Desde la raíz del repo, PowerShell
```powershell
& '.\clean up\run-cleanup.ps1' -Mode precheck
& '.\clean up\run-cleanup.ps1' -Mode cleanup -ConfirmDeleteAllQA
& '.\clean up\run-cleanup.ps1' -Mode postcheck
pnpm --filter @j5/backend db:verify
```
El runner usa .env sin imprimir secretos, arma confirmación SOLO en memoria y no reintenta mutaciones.
Manual SQL: ejecutar 01, cambiar @ConfirmCleanup=1 en una copia de 02, ejecutar y luego ejecutar 03.
02 mantiene @ConfirmCleanup=0 en Git. Usa transacción, locks, XACT_ABORT, TRY/CATCH y checks de ADMIN y migraciones intactos.
Reabre CLOSED/VOID solo dentro de la transacción para cumplir triggers; borra en orden FK. Falla sin ADMIN/schema conocido y hace rollback.

## Secuencia y limpieza local
@ResetOrderNumber=1 reinicia dbo.OrderNumber a 1 para QA/entrega inicial después de borrar todas las órdenes.
En producción NO reiniciar salvo decisión explícita; configure @ResetOrderNumber=0.
No ejecutar test:sql si crea fixtures. Si se ejecuta, repetir postcheck.
Complete [limpieza local](04_clear_local_cache.md) antes de reabrir frontend.

VehicleMakes (57) y VehicleModels (986) son tablas esperadas y se preservan completas, sin DELETE/TRUNCATE. Cleanup compara todas sus columnas antes/después dentro de la transacción y verifica 0 huérfanos. SchemaMigrations contiene 10 migraciones incluyendo 010_vehicle_catalog.sql. ADMIN y reset QA de OrderNumber conservan su comportamiento.
