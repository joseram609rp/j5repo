# SQL: siguiente etapa

Destino existente: `tallerj5` en `j5sqlserver.database.windows.net`, resource group `AZ_SQLRG_J5`, Central US. Esta etapa no se conecta ni cambia Azure.

`migrations/` contendrá scripts numerados y revisados. `queries/` contiene solamente un patrón de referencia: NO es una migración ejecutable. No existe aún esquema productivo.

Entidades previstas: Users, Sessions, Customers, Vehicles, Orders, OrderItems, IdempotencyRequests, AuditLogs. La orden conserva customer_id histórico aunque cambie el dueño actual del vehículo. Dinero `decimal(12,2)` CRC; kilometraje entero obligatorio al finalizar, nullable mientras se captura un borrador incompleto. Roles ADMIN/MECHANIC; una sucursal. Solo admin puede editar cerradas/reabrir/anular. Mecánico inicial = usuario autenticado. Sin pagos ni facturación electrónica.

Próxima implementación: índices únicos por (user_id, idempotency_key), fingerprint de método/ruta/body/If-Match, respuesta completa persistida, orden y comprobante en una misma transacción. Mantener comprobantes al menos tanto como la retención de la cola offline (definir antes de producción). Idempotencia consultada ANTES de comprobar versión. `rowversion` como ETag opaco; comparación atómica. Una colisión de clave con otro payload = 409; versión distinta = 412; falta precondición = 428. Sin actualizaciones de último escritor gana.

Sesiones persistidas por hash del token, revocación y last_activity actualizado atómicamente solo si aún vigente. Nunca resucitar sesiones vencidas. Auditoría de cambios. El adaptador debe usar consultas parametrizadas, cifrado y cancelación real al recibir AbortSignal. Reintentar conexiones nuevas y transacciones completas idempotentes, jamás INSERT/UPDATE aislados tras resultados ambiguos.
