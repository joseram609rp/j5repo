# Phase 3: contratos y límites

## Persistencia y transacciones

El runtime local y Azure Functions usan exclusivamente SqlRepository (mssql/Tedious). El doble en memoria existe únicamente en tests. Cada operación abre una conexión acotada y una transacción SERIALIZABLE; los reintentos abren una conexión nueva. Esta decisión prioriza aislamiento y claridad para el volumen inicial del taller; el pooling compartido y la reducción de contención requieren medición posterior.

Autorización, lectura del comprobante, mutación, auditoría y escritura del comprobante ocurren en la misma transacción. Las lecturas de sesión/usuario y los rangos de idempotencia usan UPDLOCK/HOLDLOCK. Desactivar o revocar no puede intercalarse entre autorización y escritura. Los deadlocks se reintentan como transacciones completas. Una respuesta perdida tras COMMIT se recupera con el comprobante de la misma clave.

IdempotencyRequests tiene PK (user_id,idempotency_key). Fingerprint canónico de método, ruta, body y If-Match. El orden de las propiedades JSON no cambia el fingerprint. Para operaciones con contraseña, su igualdad se comprueba con bcrypt; nunca se persiste un SHA-256 rápido del password. El comprobante guarda status, body y headers relevantes (ETag y Cache-Control). La misma clave con otro payload devuelve 409; se consulta el replay antes de la versión. También se conservan errores de negocio 400/404/409/412/428 generados antes de mutar. Fallos de validación de estructura, autorización e infraestructura no crean comprobante. No se eliminan comprobantes mientras la cola offline carezca de retención máxima.

Orders usa rowversion de SQL como hexadecimal opaco de 16 caracteres. El ETag lo envuelve en comillas. Si existe la orden, falta If-Match => 428; versión distinta => 412. El UPDATE también compara rowversion atómicamente. Una orden inexistente solo puede crearse sin If-Match. La UI y su cola guardan la versión como string.

## Autenticación

Username normalizado a minúsculas, 3–64 caracteres ASCII alfanuméricos, punto, guion o guion bajo. Índice único SQL sin distinción de mayúsculas. Contraseñas nuevas de al menos 12 caracteres y máximo 72 bytes UTF-8; bcrypt coste 12. El límite de bytes evita truncamiento silencioso. La respuesta de credenciales inválidas no distingue usuario inexistente, inactivo o password incorrecto. Se verifica un hash ficticio para usuarios inexistentes.

Token criptográfico de 32 bytes, codificado base64url. Solo sale por Set-Cookie; ni respuesta JSON ni SQL contienen el token en claro. Sessions guarda SHA-256, token CSRF, user_id, last_activity_at y revoked_at. Cookie HttpOnly, Path=/api, SameSite=Strict; Secure cuando NODE_ENV=production o el host Azure anuncia WEBSITE_INSTANCE_ID. Origin exacto en toda mutación, incluido login; CSRF de sesión requerido en las demás. Comparación CSRF de tiempo constante.

La sesión vence cuando ahora - last_activity_at >= 7 200 000 ms, usando UTC del servidor SQL. No existe variable de entorno para reducir/ampliar ese límite. GET, /auth/me y autosave no modifican actividad. El frontend envía /auth/activity tras eventos confiables de teclado/puntero en pestaña visible, como máximo cada 15 s; no hay heartbeat por simple polling. El servidor no puede acreditar físicamente una interacción: valida la vigencia y acepta solo el endpoint explícito. Actividad vencida o revocada no resucita una sesión.

Cambiar rol, desactivar o resetear contraseña revoca todas las sesiones del usuario en la misma transacción. Rol/active se releen desde Users en cada petición; no se confía en roles de la cookie. No se permite desactivar/degradar al último ADMIN activo. AuditLogs conserva actor, acción, entidad y fecha, sin cuerpos ni secretos.

Login tiene un límite local por proceso de 15 intentos por nombre cada 5 minutos y 100 totales por minuto. Antes de escalar/desplegar, añadir un limitador compartido en el gateway; el límite actual no pretende coordinar varias instancias.

## Datos de órdenes

El borrador conserva snapshots de nombre y placa y admite enlaces opcionales a Customers/Vehicles. Se crean clientes únicamente con datos completos válidos; se reutilizan por cédula única y vehículos por placa única. No se transfieren dueños implícitamente. Al enlazar un vehículo se toma su cliente actual si no había cliente explícito. La migración 006 permite corregir selecciones de cliente/vehículo en OPEN. En CLOSED/VOID las referencias siguen protegidas; mechanic_id nunca cambia. Una transferencia explícita de dueño modifica Vehicles.owner_id y conserva Orders.customer_id de órdenes anteriores.

Dinero DECIMAL(12,2). Cédula/teléfono como strings. Placa normalizada e indexada en Vehicles; kilometraje nullable durante borrador. El CHECK SQL impide CLOSED sin kilometraje, cliente y vehículo. La API permite close y operaciones admin explícitas reopen/void/admin-edit. Servicios son exactamente descripción + precio, sin cantidad/IVA/pagos. Total oficial SUM(OrderItems.price) en SQL, nunca un valor del frontend. Triggers mantienen el total al cambiar servicios y rechazan mutaciones de CLOSED/VOID y referencias históricas. El SQL principal es confiable; SESSION_CONTEXT identifica una operación admin autorizada por la API, no sustituye permisos de conexión. Admin-edit reabre temporalmente dentro de la misma transacción y restablece CLOSED al terminar; nada intermedio puede publicarse. La UI confirma cierre/reapertura y cambio de dueño ADMIN; no expone void/admin-edit.

## Fiabilidad

SQL: encrypt=true, trustServerCertificate=false; conexión y comando hasta 5 s, presupuesto compartido por toda la petición HTTP hasta 28 s, esperas de 5/10 s más jitter y hasta tres intentos si caben. Errores transitorios conocidos (incluido Azure dormido 40613 y deadlock 1205) se inspeccionan también dentro de errores anidados. Login SQL 18456 y cancelación no se reintentan. Al agotarse el presupuesto: 503 + Retry-After: 3.

AbortSignal cancela el Request del driver. El servidor local propaga desconexión HTTP; Functions v4 no ofrece una señal equivalente en el adaptador usado, pero sigue aplicando el presupuesto SQL. Apertura de conexión y COMMIT/ROLLBACK quedan acotados por timeouts del driver; cancelar no prueba que un COMMIT no haya llegado. Los comprobantes resuelven resultados ambiguos de escrituras de negocio.

El navegador mantiene sus reintentos para GET o escrituras con Idempotency-Key. La cola conserva payload, clave y versión antes del envío; conflictos conservan cambios y paran la sincronización. Persistencia offline por usuario en IndexedDB. Las respuestas API y credenciales no entran al caché PWA. Usuarios reales usan UUID distintos del antiguo usuario local-demo.

## Navegación y recuperación

App usa estado interno simple para dashboard/editor/open/history/users. Listas y búsquedas se obtienen de SQL con parámetros; páginas de 50 y cursor UUID ordenado por created_at/order_number. Consultar CLOSED no reemplaza el borrador activo. Cambiar a otra OPEN requiere resolver el guardado de la anterior. Al retomar, una copia pendiente se conserva y se reenvía con su payload/clave/version original; si está limpia, se consulta el estado remoto antes de editar. No se crea una orden al autenticarse.

Autosave guarda metadata, revisiones y mutaciones pendientes en el mismo store IndexedDB v1. Un close/reopen/transfer-owner se persiste antes de enviar y bloquea ediciones hasta resolverlo. Guardar nuevas selecciones nunca transfiere dueños. El servidor valida identidad exacta antes de cerrar o transferir. Las correcciones del formulario son snapshots; los catálogos existentes no se sobrescriben silenciosamente.

Usuarios ADMIN usa los endpoints existentes; el backend conserva autorización, último ADMIN, bcrypt y revocación. Los reportes y resolución guiada de conflictos quedan para Phase 4. Los tests SQL usan rollback; COMMIT ambiguo real y concurrencia entre procesos siguen pendientes. No hay despliegue.

Referencias técnicas consultadas: [mssql](https://tediousjs.github.io/node-mssql/), [Tedious](https://tediousjs.github.io/tedious/api-connection.html), [bcryptjs](https://www.npmjs.com/package/bcryptjs).

## Schema y validación Phase 2.1

created_at sigue siendo la fecha UTC de apertura; no se duplica con opened_at. closed_at marca el cierre; total_amount sustituye total. display_order_id es calculado y único (OT-YYYY-000001); una secuencia global sin reinicio anual evita carreras y admite más de seis dígitos. Los rollbacks pueden dejar huecos. Users.full_name y Customers.full_name son requeridos. Vehicles tiene marca, año, dueño actual y placa normalizada única. OrderItems solo guarda descripción y precio DECIMAL(12,2)>0.

backend/src/validation.ts se comparte con frontend: trim de nombres/marca/descripción; cédula 9 dígitos; teléfono 8; email opcional lowercase; placa uppercase sin espacios/guiones y patrón ABC123; año entero 1950 a año UTC actual+1; DB limita a 2200. Kilometraje entero 0..10000000 nullable en OPEN, obligatorio al cerrar. Precio hasta 9999999999.99 con dos decimales; la suma también debe caber. Borradores permiten campos vacíos pero no valores no vacíos inválidos. IndexedDB conserva inclusive ediciones incompletas; autosave espera valores válidos y no renueva sesión.
