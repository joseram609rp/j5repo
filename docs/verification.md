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
