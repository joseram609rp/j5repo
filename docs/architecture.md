# Arquitectura y contratos vigentes

## Componentes

Frontend React/TypeScript/Vite/PWA; API TypeScript compartida por servidor local y Azure Functions v4; Azure SQL es fuente oficial. IndexedDB persiste borradores por usuario/orden y catálogo separado. SWA sirve frontend y /api del mismo origen; no se ha validado un deployment Azure en esta revisión.

## API

Toda respuesta API usa Cache-Control no-store. Mutaciones exigen Origin exacto; las autenticadas exigen X-CSRF-Token. Escrituras de órdenes/usuarios requieren Idempotency-Key UUID y If-Match para órdenes existentes.

| Método/ruta | Contrato |
| --- | --- |
| GET /api/health | Público: disponibilidad SQL, 503 si no disponible |
| POST /api/auth/login | Username/password, cookie opaca, metadatos/CSRF de sesión |
| GET /api/auth/me | Identidad/rol y vigencia, sin renovar actividad |
| POST /api/auth/activity | Renueva únicamente sesión vigente |
| POST /api/auth/logout | Revoca sesión |
| GET /api/orders | OPEN o CLOSED; CLOSED exige q mínimo 2, máximo 50, cursor before |
| GET /api/orders/:uuid | Detalle/ETag y totales oficiales |
| PUT /api/orders/:uuid | Autosave, close/reopen/void/transfer-owner/assign-mechanic/admin-edit |
| GET /api/customers?q=... | Cédula exacta o nombre parcial, mínimo 2, máximo 20 |
| GET /api/vehicles?q=... | Placa exacta normalizada, mínimo 3 |
| GET /api/vehicles?customerId=uuid | Vehículos del cliente, máximo 20 |
| GET /api/vehicle-catalog | Catálogo activo version=1; autenticado |
| GET/POST /api/admin/users | ADMIN listar/crear; API incluye inactivos, filtro por defecto en UI |
| PATCH /api/admin/users/:uuid | ADMIN nombre, active, rol, reset password, unlock |
| DELETE /api/admin/users/:uuid | ADMIN, objetivo inactivo sin referencias; no autoborrado |

Aliases GET/DELETE /api/session y POST /api/session/activity se conservan. Admin-edit existe en backend, sin interfaz avanzada.

## Transacciones, receipts y concurrencia

SqlRepository usa mssql/Tedious, conexión acotada por operación y transacción SERIALIZABLE. Autorización, replay, mutación, auditoría y receipt comparten transacción; usuarios/sesiones/receipts usan UPDLOCK/HOLDLOCK. Reintentos abren conexión nueva. Pooling compartido queda sujeto a medición.

IdempotencyRequests tiene PK (user_id,idempotency_key). Fingerprint canónico de método/ruta/body/If-Match; igualdad de contraseñas usa bcrypt, nunca hash rápido reutilizable. Receipt conserva status/body/headers relevantes; misma clave con payload distinto devuelve 409. Replay precede chequeo de versión. Rechazos de negocio 400/404/409/412/428 pueden persistir; saveOrder revierte al savepoint todos sus efectos antes de registrar el rechazo. Errores driver/infraestructura revierten transacción completa.

Rowversion es string hexadecimal opaco de 16 caracteres; ETag lo envuelve en comillas. Orden existente sin If-Match: 428; versión distinta: 412. UPDATE compara versión atómicamente. Crear orden inexistente requiere ausencia de If-Match. Respuesta perdida tras COMMIT se recupera con la misma clave. No purgar receipts sin política compatible con pendientes offline.

## Auth y autorización

Bcrypt coste 12, contraseñas nuevas >=12 caracteres y <=72 bytes UTF-8. Username trim/lowercase ASCII 3..64 y único SQL. Dummy compare y credenciales inválidas genéricas. Cinco fallos bloquean 15 minutos en SQL; receipts de intentos evitan doble conteo al reintentar COMMIT ambiguo. Límite local adicional 15/username/5 min y 100 global/minuto; no distribuido.

Token aleatorio 32 bytes base64url, solo enviado en cookie; SQL guarda SHA-256. Cookie HttpOnly/SameSite Strict/Path /api/Secure en producción. CSRF aleatorio de sesión con comparación de tiempo constante; Origin exacto en todas las mutaciones. Dos horas de inactividad UTC SQL; GET/me/autosave no renuevan. Frontend envía actividad explícita tras eventos confiables de teclado/puntero visibles, limitada a una cada 15 segundos; el servidor no puede probar una interacción física. Actividad vencida no resucita sesión.

Roles/active se releen por petición. Reset/cambio de rol/desactivación revocan sesiones. Último ADMIN activo protegido. Borrado de usuario verifica referencias FK bajo locks; conserva historial y rechaza usuarios activos/autoborrado. ADMIN gestiona/reasigna/reabre; MECHANIC close/void solo de su asignación; ambos editan OPEN y transfieren dueño explícitamente.

## Órdenes, maestros y guards

Múltiples OPEN. Nueva orden solo por acción explícita; UUID técnico y OT-YYYYMMDD-NN visible con fecha UTC-6 y applock por día. order_number global desempata paginación. CLOSED exige campos válidos, servicios, pago/factura y total calculado; VOID mantiene datos. Guards protegen CLOSED/VOID, referencias e importes. SESSION_CONTEXT autoriza operaciones internas tras validación API; los permisos SQL deben impedir uso directo indebido.

Customers se reutiliza por cédula, Vehicles por placa única. Snapshots de contacto/placa se guardan por orden. Contacto maestro se actualiza únicamente en cierre válido; cédula no cambia. Último kilometraje no nulo incluye VOID. Cambio de dueño requiere acción explícita o resolución de cierre con vehículo/cliente/dueño esperado; stale decision devuelve 409. Transfer conserva snapshots previos; autosave no transfiere.

Validación compartida: placa uppercase sin espacios/guiones, ASCII alfanumérico 3..12; cédula 9 dígitos, teléfono 8, email opcional, año entero >=1950, kilometraje 0..10000000 requerido al cierre. Notas/recomendaciones opcionales; observación de trabajo máximo 2000. DECIMAL(12,2), CRC, IVA 13% con ROUND por línea; servidor no acepta total/tasa del cliente. Nuevos cierres exigen método de pago y booleano de factura, sin emisión electrónica. Histórico previo a 009 conserva importes.

Historial search-only: nombre parcial CI_AI, cédula/placa exactas, OT por prefijo literal. CHARINDEX/LEFT parametrizados; %, _ y [ no funcionan como comodines. Páginas 50 por created_at/order_number con cursor UUID. Página exacta de 50 puede terminar en carga adicional vacía.

## Offline, PWA y fiabilidad

IndexedDB por [userId,orderId], migración atómica de borrador legacy, payload/clave/ETag/revisión pendientes. Valores incompletos permanecen localmente; se envían solo válidos. Una acción close/reopen/transfer-owner se persiste antes del envío. Refresh/login no crean órdenes. Cambiar editor protege borrador previo. Web Lock por usuario limita editores simultáneos del mismo navegador; no sustituye rowversion entre dispositivos.

412 conserva cambios y consulta servidor. Reasignación solo de metadata permite nuevo intento explícito con ETag/clave nuevos; conflicto de contenido exige revisión por grupos/mezcla/servidor. recoveryCopies conserva la versión previa/pending y permite backup descargable. Remoto cambiado nuevamente exige revisar. Resolver no repite automáticamente acciones destructivas.

Lista/editor actualizan al recuperar foco/visibilidad y cada 30 s visibles, sin renovar sesión. PWA solicita actualización, sincroniza antes de activarla y bloquea con pendientes/conflictos. Workbox no cachea API/credenciales. CSP de SWA permite recursos del mismo origen y prohíbe frames; validar comportamiento real en Azure.

Catálogo SQL activo version=1; seed 57/986, texto manual permitido. IndexedDB schema=2 con fallback schema=1 y TTL siete días. GET retry cuatro intentos, 35 s por petición, presupuesto 120 s; reconectar refresca sin tocar drafts. No CarsXE runtime.

SQL exige TLS y certificado válido. Conexión/comando <=5 s, presupuesto HTTP SQL <=28 s; errores transitorios/deadlock pueden reintentar hasta tres veces con espera 5/10 s+jitter si caben. No retry login SQL 18456/cancelación. Agotamiento: 503 y Retry-After 3. AbortSignal cancela Request; host Functions conserva presupuesto pero no propaga desconexión como servidor local. Timeouts no prueban ausencia de COMMIT: receipts resuelven ambigüedad de escrituras.

## Límites

QA móvil/tablet/host Azure, commits ambiguos y carga real entre procesos siguen pendientes. Configurar identidad/permisos mínimos, límite distribuido y retención antes de producción. IndexedDB requiere dispositivos/perfiles confiables y limpieza operativa explícita. Ver [seguridad](security-review.md), [infra](../infra/README.md) y [verificación](verification.md).
