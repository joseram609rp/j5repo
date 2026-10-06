# Azure SQL: Phase 3

Destino previsto: tallerj5, j5sqlserver.database.windows.net, AZ_SQLRG_J5, Central US. Migraciones 001–008 aplicadas y metadata verificada el 2026-10-05. Suite SQL reversible completada; no se desplegó la app.

## Migraciones

- 001_core.sql: Users, Sessions, Customers, Vehicles, Orders, OrderItems, PK/FK, índices, validaciones y rowversion.
- 002_receipts_audit.sql: IdempotencyRequests y AuditLogs.
- 003_order_guards.sql: triggers de inmutabilidad histórica y total calculado de servicios.
- 004_vehicle_model.sql: model nvarchar(100); nullable si existen vehículos, NOT NULL si está vacía. CHECK de trim/no vacío para valores conocidos. No backfill ficticio. Backend exige modelo en nuevos vehículos y cierres; una futura migración podrá exigir NOT NULL después de completar datos verificados.
- 005_closed_notes.sql: CHECK habilitado/trusted para CLOSED con observaciones no vacías ni solo whitespace (incluidos tabs, saltos de línea y espacios Unicode de JS trim). OPEN admite vacío. Preflight comprobó cero CLOSED incompatibles; la migración valida datos existentes y falla sin modificarlos si hay incompatibilidad.
- 006_open_order_selection.sql: actualiza TR_Orders_Guard para permitir corregir referencias en OPEN, manteniendo inmutabilidad en CLOSED/VOID y de mechanic_id, autorización ADMIN y total/servicios. Añade IX_Orders_StatusCreated. No cambia datos.
- 007_optional_notes_year.sql: elimina CK_Orders_ClosedNotes y reemplaza CK_Vehicles_Year por year >=1950. No actualiza filas ni edita 001–006.
- 008_open_mechanic_reassignment.sql: conserva el trigger de 006 y permite cambiar mechanic_id solo cuando estado anterior y nuevo son OPEN y SESSION_CONTEXT(j5_mechanic_reassignment)=1, puesto por el backend tras autorizar ADMIN y usuario destino activo.
- SchemaMigrations: creada por el runner para registrar archivo, checksum SHA-256 normalizado por saltos de línea y fecha.

**pnpm db:migrate** obtiene un applock exclusivo, comprueba el historial y aplica todo lo pendiente dentro de una transacción. No contiene DROP TABLE, TRUNCATE ni modificaciones de datos existentes. 007 retira dos constraints específicas y recrea la de año; 008 modifica únicamente el trigger. Objetos preexistentes incompatibles provocan rollback. No editar migraciones ya aplicadas: agregar otro archivo numerado. El runner rechaza checksums alterados o migraciones históricas ausentes del código.

Revisar scripts y permisos antes de aplicarlos. El usuario de migraciones necesita crear tablas/índices/constraints/secuencias/triggers en dbo. La identidad del runtime necesita SELECT/INSERT/UPDATE de entidades usadas y DELETE de OrderItems para reemplazar servicios de un borrador, SELECT/INSERT de IdempotencyRequests y INSERT de AuditLogs. No necesita DROP/ALTER/CREATE. Mantener cuentas separadas. No se ejecutan migraciones al iniciar la API.

## Configuración

Copiar .env.example a .env, completar SQL_USER/SQL_PASSWORD localmente y conservar SQL_AUTH_MODE=sql para desarrollo. Requiere firewall y resolución de red hacia el servidor. No imprimir la configuración ni añadir credenciales a Git.

SQL_AUTH_MODE=default selecciona azure-active-directory-default del driver para el futuro uso de Entra/Managed Identity. La identidad debe tener usuario y permisos en tallerj5; esa configuración no se aprovisiona ni valida aquí. TLS exige certificado válido; no se ofrece opción para desactivar validación.

## Datos y garantías

Users tiene username único case-insensitive, active y rol ADMIN/MECHANIC. Sessions guarda solo hash del token, CSRF y timestamps UTC; nunca el token real.

Vehicles guarda owner_id actual y plate_normalized persistida, única e indexada. Orders.customer_id es la referencia histórica independiente. Los borradores pueden no tener cliente/vehículo aún; guardan snapshots para preservar el frontend existente. API permite corregir referencias en OPEN; CLOSED/VOID mantienen protección histórica. action=transfer-owner solo ADMIN actualiza el dueño actual mediante selección exacta, ETag/idempotencia y auditoría. Dinero decimal(12,2), cédula/teléfono varchar, kilometraje entero nullable. Cerrado exige kilometraje, closed_at, referencias completas, total positivo mediante CHECK; observaciones y recomendaciones son opcionales desde 007; triggers exigen servicios válidos y total exacto. created_at es apertura UTC. display_order_id usa secuencia global única; no reinicia cada año y puede tener huecos tras rollback.

Orders.version rowversion es opaco; API no lo convierte a número. Escrituras y comprobantes de idempotencia se confirman juntos; si falla cualquiera, se revierte todo. No hay trabajo de limpieza automática ni cascadas destructivas. Antes de definir retención de sesiones, recibos y auditoría, acordar la ventana máxima de trabajo offline.

## Prueba real reversible

Cuando las credenciales estén disponibles y se hayan aplicado las migraciones:

1. Ejecutar **pnpm test:sql**. Las suites se ejecutan secuencialmente para evitar que las transacciones rollback-only de fixtures se bloqueen entre sí con lecturas globales.
2. La suite crea usuarios/clientes/vehículos/órdenes con identificadores nuevos dentro de transacciones rollback-only.
3. Comprueba listas/búsquedas/reutilización, close/reopen, transferencia explícita e historial, además de login, contraseña incorrecta, roles, CSRF, hash de sesión, inactividad, revocación, desactivación, replay/conflicto, 412/428, rowversion y cliente histórico ante cambio de dueño.
4. Una segunda prueba comprueba el CHECK de cierre sin kilometraje.
5. Termina con ROLLBACK y comprueba que usuarios/órdenes de prueba no persistan.

No usa DROP/TRUNCATE, no reinicializa la base, no edita usuarios existentes. El esquema debe estar previamente migrado; la suite no aplica migraciones. Puede consumir números de identidad/rowversion y generar logs transaccionales aunque haga rollback. **pnpm test** y **pnpm check** omiten esta suite por defecto. No verifica COMMIT real ni concurrencia entre procesos; esas pruebas controladas siguen pendientes; la ejecución rollback-only contra Azure ya pasó.

El archivo queries/optimistic-concurrency.sql es una referencia ilustrativa del UPDATE; el código ejecutable está en backend/src/sql.ts.

## Resultado y primer administrador

`pnpm --filter @j5/backend db:verify` comprobó 9 tablas, 6 migraciones, 22 CHECK habilitados/trusted, índices únicos y 2 triggers activos. ADMIN activos: 1. Vehicles conserva su registro previo con model NULL. No se alteró el ADMIN ni se inventó un modelo. Las 11 pruebas SQL son rollback-only; cubren además OPEN con notes vacío y cierre válido/observaciones vacías, espacios, tabs, saltos de línea y espacio no separable. el fixture que agrupa decenas de solicitudes usa 55 segundos de presupuesto exclusivamente en la prueba y lo restaura al terminar. El presupuesto de producción continúa en 28 segundos.

Las migraciones 001–008 ya están aplicadas: no volver a editar sus checksums. Cualquier cambio SQL posterior requiere nueva migración.

Estado actual 2026-10-05: 9 tablas, 8 migraciones, 21 CHECK habilitados/trusted, 2 triggers activos, 1 ADMIN activo, 3 vehículos con modelo y 3 órdenes CLOSED. El cambio 007/008 solo modificó metadata; no se reasignaron ni corrigieron registros reales. Los resultados anteriores se conservan como historia.
