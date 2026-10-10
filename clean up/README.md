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
test:sql usa fixtures rollback-only; puede consumir números de secuencia. Si se ejecuta, repetir postcheck. No publicar resultados operativos de DB en el repo.
Complete [limpieza local](04_clear_local_cache.md) antes de reabrir frontend.

VehicleMakes (57) y VehicleModels (986) son tablas esperadas y se preservan completas, sin DELETE/TRUNCATE. Cleanup compara todas sus columnas antes/después dentro de la transacción y verifica 0 huérfanos. SchemaMigrations contiene 15 migraciones incluyendo 012_user_lockout.sql, 013_flexible_plates.sql , 014_username_check_pattern.sql y 015_flexible_order_plate_guard.sql. La última actualiza también el trigger de cierre para placas de 3..12 caracteres. ADMIN y reset QA de OrderNumber conservan su comportamiento.

Lockout persistido: 5 fallos / 15 minutos. Reactivación, desbloqueo y reset limpian el bloqueo; reset revoca sesiones. Cleanup conserva ADMIN con todas sus columnas y catálogo 57/986. No ejecutar cleanup como parte de las migraciones.
