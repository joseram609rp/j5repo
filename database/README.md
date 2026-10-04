# Azure SQL: Phase 2

Destino previsto: tallerj5, j5sqlserver.database.windows.net, AZ_SQLRG_J5, Central US. No se conectó ni modificó Azure durante esta fase; validación pendiente por decisión del propietario.

## Migraciones

- 001_core.sql: Users, Sessions, Customers, Vehicles, Orders, OrderItems, PK/FK, índices, validaciones y rowversion.
- 002_receipts_audit.sql: IdempotencyRequests y AuditLogs.
- SchemaMigrations: creada por el runner para registrar archivo, checksum SHA-256 normalizado por saltos de línea y fecha.

**pnpm db:migrate** obtiene un applock exclusivo, comprueba el historial y aplica todo lo pendiente dentro de una transacción. No contiene DROP, TRUNCATE ni modificaciones de datos existentes. Objetos preexistentes incompatibles provocan rollback. No editar migraciones ya aplicadas: agregar otro archivo numerado. El runner rechaza checksums alterados o migraciones históricas ausentes del código.

Revisar scripts y permisos antes de aplicarlos. El usuario de migraciones necesita crear tablas/índices/constraints en dbo. La identidad del runtime necesita SELECT/INSERT/UPDATE de entidades usadas, SELECT/INSERT de IdempotencyRequests y INSERT de AuditLogs. No necesita DROP/ALTER/CREATE. Mantener cuentas separadas. No se ejecutan migraciones al iniciar la API.

## Configuración

Copiar .env.example a .env, completar SQL_USER/SQL_PASSWORD localmente y conservar SQL_AUTH_MODE=sql para desarrollo. Requiere firewall y resolución de red hacia el servidor. No imprimir la configuración ni añadir credenciales a Git.

SQL_AUTH_MODE=default selecciona azure-active-directory-default del driver para el futuro uso de Entra/Managed Identity. La identidad debe tener usuario y permisos en tallerj5; esa configuración no se aprovisiona ni valida aquí. TLS exige certificado válido; no se ofrece opción para desactivar validación.

## Datos y garantías

Users tiene username único case-insensitive, active y rol ADMIN/MECHANIC. Sessions guarda solo hash del token, CSRF y timestamps UTC; nunca el token real.

Vehicles guarda owner_id actual y plate_normalized persistida, única e indexada. Orders.customer_id es la referencia histórica independiente. Los borradores pueden no tener cliente/vehículo aún; guardan snapshots para preservar el frontend existente. API no reasigna referencias una vez establecidas. Dinero decimal(12,2), cédula/teléfono nvarchar, kilometraje entero nullable. Cerrado exige kilometraje y referencias completas mediante CHECK.

Orders.version rowversion es opaco; API no lo convierte a número. Escrituras y comprobantes de idempotencia se confirman juntos; si falla cualquiera, se revierte todo. No hay trabajo de limpieza automática ni cascadas destructivas. Antes de definir retención de sesiones, recibos y auditoría, acordar la ventana máxima de trabajo offline.

## Prueba real reversible

Cuando las credenciales estén disponibles y se hayan aplicado las migraciones:

1. Ejecutar **pnpm test:sql**.
2. La suite crea usuarios/clientes/vehículos/órdenes con identificadores nuevos dentro de transacciones rollback-only.
3. Comprueba login, contraseña incorrecta, roles, CSRF, hash de sesión, inactividad, revocación, desactivación, replay/conflicto, 412/428, rowversion y cliente histórico ante cambio de dueño.
4. Una segunda prueba comprueba el CHECK de cierre sin kilometraje.
5. Termina con ROLLBACK y comprueba que usuarios/órdenes de prueba no persistan.

No usa DROP/TRUNCATE, no reinicializa la base, no edita usuarios existentes. El esquema debe estar previamente migrado; la suite no aplica migraciones. Puede consumir números de identidad/rowversion y generar logs transaccionales aunque haga rollback. **pnpm test** y **pnpm check** omiten esta suite por defecto. No verifica COMMIT real ni concurrencia entre procesos; esas pruebas controladas siguen pendientes junto con la primera ejecución contra Azure.

El archivo queries/optimistic-concurrency.sql es una referencia ilustrativa del UPDATE; el código ejecutable está en backend/src/sql.ts.
