# Phase 3 — cierre por asignación, pago e IVA (2026-10-05, America/Guatemala)

Repositorio C:\j5repo limpio al inicio, branch feature/orders-mvp. Esta ronda reemplaza las reglas previas de cierre: MECHANIC solo cierra su OPEN asignada; ADMIN puede cerrar cualquier OPEN. La edición general de OPEN conserva su regla previa. Sin merge, push, staging ni commit.

## Cambios

- API y SqlUnit rechazan cierre por el mecánico anterior después de la reasignación. El refresco actualiza metadata/ETag y oculta Cerrar orden al usuario no asignado; las reglas de cancelación no se relajan.
- Observaciones y recomendaciones generales opcionales: vacías/espacios aceptados; ausentes normalizan a cadena vacía. Textareas etiquetadas opcionales. El mensaje reportado «Escribe las observaciones de la orden.» no aparece en el código/build inspeccionados; no se confirmó qué versión ejecuta el navegador del usuario.
- Observación opcional por trabajo en textarea y dbo.OrderItems.notes; precio/descripción mantienen su validación. Máximo 2000 caracteres, vacío o ausente válido.
- Método de pago requerido para cierre: SINPE, crédito, débito, efectivo o transferencia bancaria. Factura electrónica requiere seleccionar Sí/No; false no se confunde con falta de elección. OPEN permite pago/factura pendientes para conservar autosave.
- Precio de trabajo sin IVA; cálculo automático de IVA 13% por línea, redondeado a centavos, y subtotal/IVA/precio final al pie. SQL y frontend coinciden; las guardas verifican total. El cliente no puede enviar tasa ni total oficiales.
- Migración aditiva 009_order_billing.sql aplicada; 001–008 permanecen intactas. tax_rate inicial 0 conserva los importes históricos; órdenes nuevas y guardados OPEN usan 13%. No se recalcularon órdenes históricas ni se modificaron usuarios ADMIN ni referencias reales. La bandera de factura registra la solicitud; no genera factura electrónica.

## Verificación

- pnpm check: typecheck y builds backend/frontend/PWA correctos; 180 pruebas locales aprobadas y 16 SQL omitidas por diseño.
- pnpm --filter @j5/backend db:verify: conectividad/esquema correctos; migraciones 001–009, nuevas columnas, constraints trusted y triggers activos.
- pnpm test:sql: 16 pruebas reales aprobadas; todas con fixtures rollback-only.
- Cobertura local: cierre propio, 403 tras reasignación, ADMIN, todos los métodos de pago, Sí y No, ausencia de campos obligatorios, notas vacías/ausentes, observaciones opcionales por trabajo, límites, IVA por línea y consistencia de totales.
- Cobertura SQL: pago/factura y nuevos totales end-to-end, cierre bloqueado al mecánico anterior, observación por trabajo persistida, redondeo por línea y órdenes históricas con importes intactos. Pruebas de constraints para cierre sin pago/factura se ejecutan en rollback.
- git diff --check sin errores. Sesión, idempotencia/ETag, cancelación VOID y refresco permanecen cubiertos. .env local ignorado y sin tracking/staging; no se imprimieron secretos.

---

# Phase 3 — cancelación y reasignación operativas (2026-10-05, America/Guatemala)

Repositorio C:\j5repo inspeccionado limpio, en feature/orders-mvp antes de editar. Sin merge, push, commit, staging ni despliegue; dev/main intactos. CarsXE fuera de scope.

## Resultado de esta ronda

- Cancelar orden visible en editor y lista OPEN; desde la lista abre el detalle y confirmación de la orden seleccionada. MECHANIC solo cancela la asignada a su usuario; ADMIN cualquier OPEN. Backend y repositorio SQL validan permisos y estado. CLOSED/VOID rechazan cancelación y reasignación. La confirmación usa el número de orden y avisa que desaparecerá de abiertas.
- action=void usa PUT /api/orders/:uuid, status=VOID y audit ORDER_VOIDED con entity_id=orderId. La operación SQL actualiza únicamente estado/fecha; no hace DELETE ni reemplaza OrderItems ni customer/vehicle/referencias históricas. Un borrador local inválido no impide cancelar una OPEN ya persistida. VOID queda read-only, desaparece de OPEN y se excluye de historial normal.
- ADMIN selecciona un usuario activo elegible y pulsa Actualizar mecánico. Cambiar el dropdown no edita el borrador ni inicia autosave. action=assign-mechanic actualiza solo mechanic_id/fecha, devuelve orden y ETag nuevos y audita ORDER_MECHANIC_CHANGED. El mecánico normal ve el asignado read-only. Se conserva la edición general de OPEN por los mecánicos del taller.
- La lista se monta/consulta SQL al entrar o reentrar. Editor y lista OPEN refrescan mediante GET al recuperar foco/visibilidad y cada 30 segundos estando visibles. El editor avisa de la reasignación y recalcula permiso de cancelación inmediatamente. Las respuestas tardías de una orden abandonada se ignoran.
- Borradores sucios mantienen su versión base; GET no reconoce como guardados cambios locales. Un 412 refetch conserva el borrador. Reasignación sin cambio de contenido permite retry explícito con ETag y clave de idempotencia nuevos; cambios remotos de contenido detienen sync para revisión. No se reintenta automáticamente una cancelación rechazada.
- Se mantienen Origin/CSRF, recibos idempotentes, If-Match y rowversion, transacciones y parámetros SQL. Solo actividad real renueva la sesión de dos horas; GET/polls/foco/autosave no la renuevan.

## Verificación final

- pnpm check: typecheck, 168 pruebas locales aprobadas y builds backend/frontend/PWA correctos; 13 SQL omitidas en el comando local por diseño.
- pnpm --filter @j5/backend db:verify: conectividad y estructura correctas; SchemaMigrations 001–008 ya aplicadas y triggers activos. AuditLogs existente basta. No se crearon ni editaron migraciones ni se aplicó DDL.
- pnpm test:sql: 13 pruebas reales aprobadas, todas rollback-only. Incluye cancelar propia/403 para no asignado, ADMIN, idempotencia, CLOSED/VOID, reasignación y rowversion/ETag, listado con asignado actual, auditoría, preservación de IDs/contenido de trabajos, cliente, vehículo e historial anterior. Las fixtures y sus usuarios no persisten; no se modificaron usuarios ADMIN ni datos reales.
- Frontend: selector sin autosave y botón explícito ADMIN; cancelación por permisos desde editor/lista; confirmación, VOID read-only y retirada de lista; foco y polling con aviso de reasignación; sesión sin renovación por consultas; 412 con copia local conservada y clave nueva al retry; respuesta tardía ignorada al cambiar de orden.
- git diff --check sin errores. .env local ignorado, sin tracking/staging y sin imprimir secretos.

README actualizado con contratos, permisos, auditoría y refresco. Los registros siguientes documentan rondas anteriores; las reglas de esta ronda sustituyen sus descripciones antiguas de void/reasignación.

---

# Phase 3 — cambios 1–7 verificados el 2026-10-05 (America/Guatemala)

Trabajo en C:\j5repo, branch feature/orders-mvp inspeccionado antes de editar. Sin merge, push, staging, commit ni despliegue. El cambio previo en .env.example se conservó. CarsXE, catálogos, seed y llamadas externas no se implementaron.

## Cambios entregados

- Nueva orden crea un UUID nuevo por acción explícita aunque el usuario ya tenga OPEN. Una guarda impide ejecuciones concurrentes del mismo clic. Login, refresh y re-render no crean órdenes.
- IndexedDB usa [userId, orderId], con migración atómica del borrador legacy. Cada orden conserva su payload, revisión, ETag y clave de idempotencia. La lista OPEN pagina todas las órdenes del taller e incorpora borradores locales pendientes; Continuar recupera la copia de la orden elegida. Ver CLOSED no descarta las OPEN.
- ADMIN puede seleccionar usuarios activos MECHANIC o ADMIN en OPEN: ambos roles pueden trabajar como mecánicos. MECHANIC ve el nombre sin selector; cambiarlo por API devuelve 403. CLOSED/VOID no admiten reasignación, ni usando reopen/admin-edit. AuditLogs guarda actor_id, entity_id de orden y action=ORDER_MECHANIC:<nuevo UUID> sin migrar el schema de auditoría.
- Seleccionar una placa existente mantiene el cliente elegido. Solo si el dueño difiere se muestran ambos nombres, Mantener dueño actual y, para ADMIN con referencias válidas, Actualizar dueño a [nombre] con confirmación. Un guardado normal nunca modifica owner_id; transfer-owner conserva Orders.customer_id histórico.
- Historial inicia vacío sin consultar el endpoint. CLOSED requiere q de al menos dos caracteres en API y repositorio. Nombre parcial con Latin1_General_100_CI_AI, cédula exacta, placa exacta normalizada y OT por prefijo literal. SQL parametrizado CHARINDEX/LEFT trata %, _ y [ como texto. Páginas de 50 con cursor before y desempate por order_number.
- Observaciones y recomendaciones opcionales en OPEN/CLOSED; se conserva validación de cliente/cédula/teléfono/placa/marca/modelo/año/kilometraje y servicios válidos con total calculado en backend.
- Año entero >=1950, sin máximo funcional ni atributo max. SQL conserva su tipo int. Probados 1949 (rechazo), 1950, 2028, 2035, 100000 y 2147483647 (aceptación).

## Endpoints afectados

- GET /api/orders?status=OPEN|CLOSED&q=...&before=uuid: CLOSED exige criterio; búsqueda exacta/parcial según campo; límite server-side 50.
- PUT /api/orders/:uuid: intención mechanicId para ADMIN OPEN; notas vacías y años futuros válidos; mantiene ETag, rowversion, idempotencia y total oficial.
- GET /api/customers?q=...: nombre parcial case/accent-insensitive; cédula exacta; máximo 20.
- GET /api/vehicles?q=...: placa exacta normalizada; devuelve dueño para la decisión explícita.
- GET /api/admin/users: endpoint existente reutilizado para listar candidatos activos; no se cambió su contrato ni se exponen hashes.

## Migraciones y validación

Preflight SQL confirmó 001–006 aplicadas y tres vehículos antes de trabajar. No se editaron los archivos aplicados ni sus checksums.

- 007_optional_notes_year.sql elimina CK_Orders_ClosedNotes y reemplaza CK_Vehicles_Year por year >=1950. Solo metadata.
- 008_open_mechanic_reassignment.sql conserva los guards existentes y permite cambio de mecánico solo entre estados OPEN con contexto autorizado por backend.
- pnpm check final: tipos y builds backend/frontend/PWA aprobados, 150 tests locales aprobados; 13 SQL omitidos intencionalmente en este comando.
- pnpm db:migrate después de pnpm check: únicamente 007 y 008 aplicadas.
- pnpm --filter @j5/backend db:verify: 9 tablas, 8 migraciones, 21 CHECK habilitados/trusted, 2 triggers activos y 1 ADMIN activo. Tres vehículos, todos con modelo, y tres órdenes CLOSED. Las migraciones no modificaron filas reales.
- pnpm test:sql: 13 aprobados en 123.50 s, dos suites secuenciales. Fixtures nuevos, rollback-only y comprobaciones de ausencia de las órdenes/usuarios temporales. Incluye auth/permisos, idempotencia, ETag/rowversion, totales, guards, selección de cliente, propiedad histórica, reasignación, notas vacías y whitespace, límites/paginación y año.
- UI automatizada y fake-indexeddb: múltiples OPEN, continuaciones independientes, refresh/re-render, legacy, colas/claves distintas, selector por rol/estado, decisión de dueño sin transferencia implícita, cierre sin notas, historia sin consulta inicial y Cargar más.

## Límites antes del catálogo

No hay blocker detectado para retomar el catálogo como trabajo separado. No se hizo un nuevo smoke visual autenticado con credenciales humanas. Las pruebas SQL con rollback no acreditan COMMIT ambiguo ni concurrencia real entre procesos; permanecen en Phase 4, junto a recuperación guiada de conflictos, despliegue, Managed Identity, limitador compartido y PWA en dispositivos reales. El límite por usuario del Web Lock se conserva, aunque se permiten múltiples órdenes por usuario en almacenamiento y SQL.

---

Los reportes siguientes son históricos y sus conteos/reglas anteriores fueron sustituidos por el estado de entrega descrito arriba.

# Phase 3 — Orders MVP verificado el 2026-10-05 (America/Guatemala)

## Entrega vigente

`C:\j5repo`, branch `feature/orders-mvp`. Phase 2 (`15994cf`) integrada a `dev` mediante fast-forward local antes de crear el branch. `main` intacto. Phase 3 queda en su rama para revisión; sin push, merge final ni despliegue Azure.

Flujo implementado: login → dashboard → nueva OPEN/retomar → SQL + IndexedDB autosave → lista OPEN de todos los mecánicos → continuar → cierre validado/confirmado → CLOSED de solo lectura → historial/búsqueda. ADMIN también tiene usuarios básicos completos y reapertura confirmada. Cambiar el dueño requiere acción ADMIN explícita; guardar/seleccionar otro cliente no transfiere ownership y las órdenes anteriores conservan su cliente.

## Validación

- `pnpm check`: tipos y builds backend/frontend/PWA aprobados; **135 tests locales** aprobados. Los 11 SQL se omiten por diseño en este comando.
- `pnpm db:migrate`: aplicó solo **006_open_order_selection.sql**. 001–005 intactas; checksums verificados por el runner. 006 permite correcciones de selecciones OPEN, conserva guards de CLOSED/VOID, mechanic_id y total/servicios, y agrega índice de listas. Sin modificaciones de datos.
- `pnpm test:sql`: **11 tests aprobados**, aproximadamente 112 s; ambas suites ejecutadas secuencialmente. Se usan exclusivamente fixtures nuevos, transacciones rollback-only y comprobación posterior de ausencia de usuarios/órdenes de prueba.
- SQL real: login/auth/roles/CSRF/expiración/revocación; ETag/rowversion, replay y conflictos; total oficial SUM; cierre válido/faltantes/whitespace; guards directos; modelo legacy; listas cross-mechanic; búsquedas por OT/placa/cédula/nombre; reutilización sin duplicados; dueño permanece intacto en guardado normal; transferencia explícita ADMIN e histórico conservado; reapertura ADMIN.
- `db:verify` después de la suite: 9 tablas, **6 migraciones**, 22 CHECK habilitados/trusted, índices únicos e IX_Orders_StatusCreated, 2 triggers activos, **1 ADMIN activo** y el **mismo vehículo existente** con modelo desconocido. Cero CLOSED sin observaciones. No se cambió el ADMIN ni se rellenaron datos reales.
- UI automatizada interactiva: dashboard por rol sin crear órdenes al login; crear/retomar OPEN; legacy local; validación completa con errores inline/resumen; close/read-only/reopen; búsqueda/selección de dueño; historial vacío; detalle CLOSED conserva borrador activo; usuarios crear/desactivar confirmados; estado local en listas.
- IndexedDB real emulado con fake-indexeddb: aislamiento por usuario, pending close persistido, recuperación de payload/clave/ETag exactos tras reinicio, sin segundo cierre. Regresiones autosave incluyen respuesta perdida, edición bloqueada CLOSED, rechazo conocido de cierre y replay rechazado sin falsa confirmación.
- Retry manual solo ante error recuperable. Offline, conflicto y expiración mantienen sus comportamientos. CRC y kilometraje siguen numéricos; previews probados.
- Navegador real con API simulada temporal, sin credenciales humanas ni escrituras SQL: dashboard desktop/móvil, entrada de todos los campos/trabajo, confirmación con OT/total, cierre y campos bloqueados. Viewport 390 px: scrollWidth 375 px, botones visibles mínimo 48 px. Vista temporal retirada después de revisión.
- `git diff --check` aprobado. `.env` ignorado, sin seguimiento ni staging; secretos locales nunca impresos. Revisión del diff frente a credenciales locales sin revelar valores.

## Límites y Phase 4

Las pruebas SQL hacen rollback: no acreditan COMMIT persistente real, pérdida de respuesta tras COMMIT real ni concurrencia entre procesos. El browser smoke usa datos simulados; las suites API/SQL verifican los contratos del runtime real. Las suites SQL son secuenciales porque sus transacciones largas de fixtures y lecturas globales pueden provocar deadlocks artificiales cuando se ejecutan juntas; los reintentos transaccionales de producción conservan su presupuesto original.

Phase 4: recuperación guiada de conflictos, anulación/admin-edit UI, reportes, retención de recibos/sesiones, catálogos extensos y pruebas de COMMIT/concurrencia. Antes de producción: despliegue/configuración HTTPS/Functions/Managed Identity, mínimos permisos SQL, limitador compartido y PWA en dispositivos reales. Usuarios básicos ya implementados; no se deja un módulo funcional a medias.

---

Los reportes siguientes son históricos de Phase 2 y fases anteriores; el estado vigente es Phase 3 arriba.

# Limpieza final de UI Phase 2 — 2026-10-05 (America/Guatemala)

- Se eliminaron slogans, panel de módulos futuros y footer decorativo. Formulario a todo el ancho, login centrado y campos apilados en móvil; logo J5 y paleta azul/rojo conservados.
- Retry manual condicionado a fallo recuperable de sincronización. Estados de progreso/guardado/copia local visibles; offline no ofrece retry manual y conserva el listener online existente. Conflictos y expiración no ofrecen un botón ineficaz.
- Pruebas de render conectadas a los reportes de Autosave verifican estado sano, fallo, replay con la misma mutación, recuperación offline, conflictos y expiración. Persistencia, debounce, idempotencia y ETag sin cambios.
- pnpm check: 112 pruebas locales aprobadas, 10 SQL omitidas por diseño; typecheck y builds correctos. git diff --check correcto; .env ignorado y no staged.
- Sin migración, acceso a Azure SQL, cambios de ADMIN, merge ni push. Layout verificado por código y render automatizado; sin revisión visual manual en navegador.

---

# Cierre final Phase 2 — 2026-10-05 (America/Guatemala)

## Resultado actual

Trabajo en C:\j5repo, feature/backend-foundation. Sin staging, commit, merge, push ni despliegue. Blockers identificados para pasar a Phase 3: ninguno.

- Kilometraje: input numérico conservado; preview inmediato con coma, por ejemplo 128,400 km. formatMileage cubre cero, null/undefined y números inválidos sin NaN. Estado/API/SQL siguen usando número entero; autosave probado con payload 128400 sin formato.
- Observaciones generales obligatorias para close y admin-edit de CLOSED mediante canClose. OPEN permite vacío y espacios; recomendaciones siguen opcionales. Error inline accesible después de blur, sin error inicial vacío. El helper visibleErrors(..., true) incluye notes al intentar cerrar; el botón/flujo completo de cierre sigue siendo trabajo de Phase 3.
- 005_closed_notes.sql agrega CK_Orders_ClosedNotes WITH CHECK, solo para CLOSED; reconoce espacios de JS trim, incluidos tabulaciones, saltos de línea y espacio no separable. Preflight: cero CLOSED incompatibles. La migración se niega a aplicar si existen observaciones históricas incompatibles, sin rellenarlas ni modificar datos reales. 001–004 y sus checksums intactos.
- pnpm db:migrate aplicó únicamente 005. db:verify final: 9 tablas, 5 migraciones, 22 CHECK habilitados/trusted, índices únicos y 2 triggers activos. Sigue 1 ADMIN activo y 1 vehículo con model NULL; no se alteraron usuarios ni datos reales.
- pnpm check aprobado: tipos, 104 pruebas locales y builds backend/frontend/PWA. 10 SQL omitidas por diseño en check. pnpm test:sql: 10 aprobadas, rollback-only, aproximadamente 85 segundos. Cierre con observaciones válidas pasa; vacío/espacios/tabulaciones/saltos de línea fallan por API; SQL también prueba espacio no separable. OPEN con notes vacío sigue pasando.
- Regresiones cubiertas por las suites: session bootstrap, recuperación y replay de autosave, borradores sin model, idempotencia, ETag/rowversion, roles/auth/CSRF, expiración/revocación, totales y guards de órdenes. Branding/assets y schema de IndexedDB no cambiaron. No se realizó una nueva prueba visual autenticada con credenciales humanas.
- .env ignorado y no tracked; no se imprimieron secretos. git diff --check final aprobado.

## Incidencias de verificación resueltas

El entorno restringido impidió escribir dist y un primer lanzamiento de tsx falló en userInfo; se repitió con acceso al repositorio autorizado. El primer preflight SQL agotó presupuesto; el segundo respondió. Una verificación de metadata durante la suite SQL agotó presupuesto; al repetirla después de finalizar las transacciones pasó. No se ampliaron timeouts de producción. Rollup emitió advertencias sobre anotaciones de comentarios de Zod y completó el build.

## Revisión y trabajo posterior

Revisión de código frontend/backend, migraciones, auth, transacciones/reintentos, autosave, configuración PWA y adaptadores locales/Functions: ningún blocker adicional identificado para iniciar Phase 3. Esto no confirma un despliegue Azure ni reemplaza las pruebas que siguen pendientes.

Para fases posteriores: extraer validación compartida a un paquete independiente; UI completa de cierre/reapertura/anulación e historial, recuperación guiada de conflictos, modelos históricos completados con información verificada, medición de pooling/contención y retención de sesiones/recibos/auditoría. Antes de producción: host Functions, dominio/cookies HTTPS y APP_ORIGIN, identidad SQL con permisos mínimos/Managed Identity, limitador compartido de login, PWA en dispositivos y pruebas controladas de COMMIT ambiguo/concurrencia entre procesos. No se amplió scope con estos trabajos.

---

Los siguientes reportes son históricos; el estado vigente es el cierre del 2026-10-05 anterior.

# Correcciones de smoke testing — 2026-10-04 (America/Guatemala)

## Resultado actual

- Trabajo en C:\j5repo, branch feature/backend-foundation. Se conservaron los cambios locales previos de login y sus pruebas. Sin commit, staging, merge a main/dev, push ni despliegue.
- Session bootstrap checking/authenticated/anonymous. El formulario de login se renderiza solo tras resolver 401; sesión válida pasa al borrador IndexedDB. Mientras health/auth están pendientes se muestra J5 con estado accesible; fallo de red muestra Reintentar y no asume sesión anónima. El área mantiene altura mínima durante checking y preparación del borrador.
- Cliente/vehículo/trabajos separados. Errores inline tras blur/touched o contenido inválido, con aria-invalid/aria-describedby. Nombre completo, marca, modelo, año y kilometraje tienen mensajes propios; cédula/teléfono/email/placa conservan reglas y normalización. Campos iniciales vacíos y trabajos recién agregados no aparecen todos en rojo. El helper de intento de cierre incluye todos los campos y trabajos faltantes; la UI completa de cierre aún no existe. action=close se verifica en pruebas API.
- Precio sigue siendo input numérico sin comas en payload/DB; vista CRC y total estimado usan es-CR con miles (espacio no separable) y decimales cuando corresponde. Total oficial sigue calculado por SQL.
- Modelo soportado por el schema compartido (Draft de domain se infiere de él), frontend, IndexedDB, SqlRepository, draft_data y Vehicles. Los borradores antiguos y pending receipts sin modelo permanecen válidos para OPEN. No se cambió el nombre/versión de IndexedDB ni el mecanismo de claves, ETag, rowversion o auth.

## Azure SQL

Preflight de solo lectura confirmó 001/002/003 ya registradas y **1 vehículo real**. Se revisó 004_vehicle_model.sql y pnpm db:migrate reportó únicamente **004_vehicle_model.sql** aplicada. Los archivos/checksums anteriores permanecen intactos; el runner comprobó el historial antes de ejecutar.

004 conserva datos existentes: model nullable sin valor ficticio para registros antiguos y CHECK habilitado/trusted que exige trim/no vacío cuando hay valor. Una base vacía recibe NOT NULL. SqlRepository exige modelo válido al crear vehículo y la API lo exige al cerrar. Un NULL histórico solo se completa con el modelo ingresado en un cierre explícito; modelos conocidos no se sobrescriben. Una futura transición a NOT NULL requiere modelos verificados y otra migración.

Verificación posterior: 9 tablas, 4 migraciones, Vehicles.model nullable, **1 vehículo y 1 modelo desconocido**, **1 ADMIN activo**, restricciones habilitadas/trusted y 2 triggers activos. No se editaron datos reales ni el ADMIN durante esta tarea. .env se usó localmente sin mostrar secretos.

## Pruebas y límites

- pnpm check: **95 pruebas locales aprobadas**, 6 SQL omitidas intencionalmente; typecheck y builds backend/frontend/PWA correctos.
- Pruebas de render y bootstrap: estado inicial J5 sin login/input de orden, auth pendiente sin transición anónima, sesión válida, 401, error de red y gate que muestra login solo en anonymous. No se realizó una sesión manual de navegador con la contraseña humana.
- Pruebas de nombre vacío/espacios, año/kilometraje null, modelo vacío/válido, separación de errores de OrderItem, touched, cierre y formato CRC. Prueba adicional de autosave conserva exactamente un pending antiguo sin model antes de enviar la siguiente revisión con modelo nuevo.
- pnpm test:sql: **6 pruebas reales aprobadas**, todas rollback-only. Auth, roles/CSRF, expiración/logout, idempotencia, rowversion/ETag, cliente histórico, cierre/admin-edit/reopen, totales y guards existentes; adicional modelo en draft/tabla, precio 125000, NULL legado conservado en OPEN y completado al cierre explícito. Se comprueba ausencia de usuarios/órdenes fixture al terminar.
- Dos primeras ejecuciones del fixture largo agotaron el presupuesto de producción de 28 segundos al agrupar decenas de solicitudes en una transacción. El límite agregado del fixture se ajustó a 55 segundos y se restaura en finally; la ejecución final tardó aproximadamente 37 segundos en ese fixture. No se ampliaron timeouts de producción ni de consultas. Suite completa: aproximadamente 72 segundos.
- Continúan los límites de fase anterior: no UI completa de cierre, despliegue Azure, Managed Identity ni COMMIT ambiguo real. Verificación automatizada de render/bootstrap; la confirmación visual con la sesión humana queda para la siguiente prueba local.
- .env ignorado y no staged; git diff --check sin errores. No merge ni push.

---

El siguiente reporte se conserva como registro histórico anterior; su conteo de ADMIN y su paso de creación ya fueron superados por el estado actual.

# Verificación Phase 2.1 — 2026-10-04 (America/Guatemala)

## Resultado

- Branch feature/backend-foundation; main/dev intactas, sin merge ni despliegue.
- pnpm check: 68 pruebas locales aprobadas, 5 SQL omitidas por diseño; typecheck y builds backend/frontend/PWA correctos.
- Conectividad TCP 1433 y login SQL confirmados usando .env local; el primer intento autenticado agotó timeout, el siguiente respondió. No se modificó firewall ni TLS.
- Preflight confirmó base sin tablas; pnpm db:migrate aplicó 001_core.sql, 002_receipts_audit.sql y 003_order_guards.sql en una transacción.
- Metadata real: 9 tablas, SchemaMigrations con 3 registros, 21 CHECK habilitados/trusted, índices únicos y 2 triggers activos. No se consultaron credenciales ni datos personales para el reporte.
- pnpm test:sql: 5 pruebas reales aprobadas con rollback-only. Login/password incorrecto, auth/me, actividad, logout, roles/CSRF, idle, desactivación, idempotencia, ETag 412/428, historia de dueño, cierre sin items/mileage rechazado, total SQL 100.30, CLOSED inmutable para mechanic edición admin que conserva fecha de cierre y reapertura admin. Tres fixtures adicionales verifican directamente los triggers SQL contra mutación de CLOSED, cambios de servicios cerrados y total falsificado. Fixtures no persisten.
- pnpm dev iniciado. GET http://127.0.0.1:7071/api/health devuelve {"status":"ok","mode":"sql"}. Login con logo real revisado en navegador.

## Validaciones y branding

27 tests del esquema compartido cubren nombre, cédula, teléfono, email, placa, año UTC dinámico, descripción/precio, centavos, overflow agregado, campos de cierre y rechazo de total cliente. Prueba API adicional verifica cierre y permisos admin. IndexedDB guarda cambios incompletos y autosave solo envía payload válido. Mecánico se asigna desde el usuario autenticado al crear; no se acepta un ID enviado por el frontend. Todos pueden leer órdenes ajenas.

Logo original intacto; copia web en frontend/public/logo.png. Paleta CSS azul/rojo, favicon/PWA SVG cuadrado con J5 embebido, responsive. No se utilizó una ruta absoluta en runtime.

created_at es la apertura UTC; no se duplica opened_at. total_amount es oficial y lo calcula SQL desde description/price de cada servicio. display_order_id usa secuencia global sin reinicio anual (huecos posibles por rollback). CLOSED exige servicios válidos, datos completos, kilometraje y fecha de cierre. Los triggers protegen total y referencias históricas.

## Paso interactivo pendiente

ADMIN activos: 0. Se ejecutó pnpm admin:create; devolvió TTY_REQUIRED antes de solicitar credenciales. No se creó un usuario real.

En una terminal PowerShell normal ejecutar:

    cd C:\j5repo
    pnpm admin:create

Ingresar nombre completo, username (3–64 caracteres), contraseña elegida por el usuario (mínimo 12 caracteres, máximo 72 bytes UTF-8, entrada oculta) y confirmación. El comando vuelve a comprobar que no exista ADMIN activo. No enviar contraseñas por chat ni argumentos. Después iniciar sesión en http://127.0.0.1:5173 y probar el borrador. No se hizo ese recorrido autenticado con usuario humano porque aún no existen sus credenciales; el flujo equivalente fue verificado con fixtures SQL rollback-only.

## Límites

Sin UI completa de cierre/reapertura/anulación ni gestión del cambio de dueño; las reglas API/DB y el historial sí están listas. Sin pruebas de COMMIT ambiguo real, concurrencia entre procesos, Managed Identity, host Functions, dispositivo PWA instalado o despliegue Azure. La validación evita datos mal digitados; no acredita identidad real, kilometraje real ni trabajo físicamente realizado.

## Git y secretos

.env permanece local/ignorado, sin staging. .env.example contiene placeholders vacíos y nombres públicos del destino. No se imprimieron SQL_USER/SQL_PASSWORD ni connection strings. Sin push. git diff --check final sin errores; pnpm check final aprobado (68 locales, 5 SQL omitidas por diseño, builds correctos); no se hizo commit automático.
