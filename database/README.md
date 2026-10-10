# Azure SQL

15 migraciones (001–015); API usa SQL real. No hay migraciones automáticas al iniciar el runtime. La configuración de destino se mantiene local, sin credenciales en documentación.

## Historia de esquema

| Migración | Resultado |
| --- | --- |
| 001_core | Users/Sessions/Customers/Vehicles/Orders/OrderItems, FK, índices, rowversion |
| 002_receipts_audit | IdempotencyRequests y AuditLogs |
| 003_order_guards | Inmutabilidad histórica y totales calculados |
| 004_vehicle_model | Modelo; nullable para registros anteriores, validación para valores presentes |
| 005_closed_notes | Requisito histórico de notas al cierre, retirado por 007 |
| 006_open_order_selection | Permite corregir selección cliente/vehículo en OPEN |
| 007_optional_notes_year | Notas opcionales y año >=1950 |
| 008_open_mechanic_reassignment | Cambiar asignación solo OPEN con autorización ADMIN |
| 009_order_billing | Pago/factura, IVA por línea y observaciones por trabajo |
| 010_vehicle_catalog | Seed 57 marcas / 986 modelos y constraints de catálogo |
| 011_daily_order_numbers | Fecha UTC-6, consecutivo diario, backfill, índice y trigger |
| 012_user_lockout | Contadores, bloqueo y marca de intento de login |
| 013_flexible_plates | Placa normalizada alfanumérica de 3..12 caracteres |
| 014_username_check_pattern | Constraint ASCII correcto y unicidad canónica preservada |
| 015_flexible_order_plate_guard | Trigger de cierre consistente con placa flexible |

`pnpm db:migrate` obtiene applock exclusivo, comprueba archivos/checksums SHA-256 normalizados por saltos de línea y aplica pendientes transaccionalmente. SchemaMigrations registra nombre/checksum/fecha. Rechaza migraciones históricas ausentes o alteradas. No editar archivos aplicados: añadir una nueva migración. El backfill de 011 cambia identificadores visibles/rowversions, conserva UUID y snapshots y puede requerir revisar borradores offline; no crea alias para números antiguos.

## Identidades y permisos

Separar cuenta DDL y runtime. Migraciones necesitan crear/modificar tablas, constraints, índices, secuencias y triggers en dbo. Runtime necesita SELECT/INSERT/UPDATE de entidades, DELETE de OrderItems y Users para acciones autorizadas, SELECT/INSERT de receipts y INSERT de auditoría; el borrado de Users solo procede para usuarios inactivos sin referencias. No necesita DDL. Configurar/grabar los grants mínimos exactos en el entorno antes de producción; SESSION_CONTEXT es una señal interna de la API para guards, no una frontera de permisos ante acceso SQL directo.

`SQL_AUTH_MODE=sql` usa SQL_USER/SQL_PASSWORD; `default` usa azure-active-directory-default. La ruta de identidad existe en código; su configuración y verificación Azure están pendientes. Managed Functions en SWA Free no admiten identidad administrada para la API; ver infra/README.md para la decisión de alojamiento antes de producción. Cifrado obligatorio y certificado validado (`encrypt=true`, `trustServerCertificate=false`). Firewall debe permitir únicamente conexiones autorizadas.

## Verificación y operaciones

`pnpm --filter @j5/backend db:verify` inspecciona metadata, 15 migraciones, constraints trusted, índices, triggers y catálogo 57/986 sin duplicados/huérfanos; no lista PII ni hashes. El runner de migraciones es quien valida checksums, no db:verify.

`pnpm test:sql` ejecuta fixtures dentro de rollback-only, secuencialmente. SQL sequences pueden consumir números aunque las filas reviertan; no asumir que una prueba deja todos los contadores sin huecos. No demuestra COMMIT ambiguo ni carga de producción.

El runtime abre transacciones SERIALIZABLE; autoriza, muta, audita y guarda receipt juntos. Savepoint de orden revierte rechazo de negocio antes de guardar el error idempotente. Rowversion protege cambios concurrentes. Retención de sesiones/receipts/auditoría no está automatizada; acordar política compatible con pendientes offline antes de purgar receipts.

[Cleanup DEV/QA](../clean%20up/README.md) conserva ADMIN, historia de migraciones y catálogo completo. No ejecutar en producción ni como migración. [Verificación actual](../docs/verification.md).
