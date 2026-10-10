# Phase 3: correcciones de QA — 10 octubre 2026

Repositorio: C:\j5repo. Branch inicial y final: feature/orders-mvp. HEAD inicial: fb50e8e11af694e1c34cc70e912d9c15dc1b4d91. Working tree inicialmente limpio. No commit, merge, push, staging, cleanup real ni CarsXE.

## Username: causa comprobada

SQL QA contiene dos usernames distintos:

| ID | Username | Rol | Active |
|---|---|---|---|
| 36CA3B19-D9D5-47B5-A578-C7A2BAC4D801 | jhernadez | MECHANIC | false |
| 4D826FDD-C634-4173-97F0-651B966ABCCF | jhernandez | ADMIN | false |

Al primero le falta una n. No hay duplicados exactos ni trim/lower. UQ_Users_Username es UNIQUE(username), habilitado, sin dependencia del rol. Columna nvarchar(64), Latin1_General_100_CI_AS. No hay whitespace invisible en esos valores (18 y 20 bytes). No se borraron ni consolidaron cuentas.

Normalización trim/lower en schemas y repository antes de comparar/persistir. Se mantiene el único constraint existente; no hay índices únicos redundantes. El CHECK canónico ahora usa comparación binaria y restringe caracteres ASCII y longitud. SQL 2601/2627 se convierte en 409 USERNAME_EXISTS. Frontend explica el username que ya existe. La lista reemplaza el resultado, no concatena cards y descarta cargas antiguas; la prueba SQL de GET /api/admin/users comprueba IDs únicos.

## Seguridad y usuarios

Confirmación de password en crear y reset; no sale del frontend. Mismatch y límite 12 caracteres / 72 bytes UTF-8 se validan antes de submit. Componente accesible Mostrar/Ocultar usado en login y ambos pares de password; conserva current-password/new-password y relaciona botón/campo con aria-controls.

Login serializado con UPDLOCK/HOLDLOCK y transacción SERIALIZABLE. Cinco fallos consecutivos bloquean 900000 ms. Se usa hora SQL. Un fallo devuelve respuesta en lugar de lanzar excepción dentro del callback para que el contador haga COMMIT. No se almacena ningún username inexistente. Inactive no se reactiva automáticamente. Durante bloqueo no se verifica el hash real; respuesta genérica INVALID_CREDENTIALS y verificación dummy. Se conserva limiter local/global.

Reactivación, reset y PATCH unlock:true limpian contador y locked_until. Reset revoca sesiones. Marcador last_login_attempt_id y receipts internos de fallo evitan doble incremento al reintentar un COMMIT ambiguo, incluso si hubo otro intento entre medio. Receipt no guarda contraseña ni cookie. Login correcto conserva hash de token y timeout de sesión 2h.

Lista oculta inactivos por defecto; toggle los muestra. Estado temporal distinto de inactivo. Desbloquear aparece mientras lockedUntil está futuro. DELETE ADMIN-only con CSRF/idempotencia, exige inactive, impide auto-borrado y conserva último ADMIN. Inspecciona todas las FKs hacia Users en la misma transacción, incluyendo Orders, AuditLogs, Sessions y IdempotencyRequests; conserva también referencias efímeras. canDelete de GET controla disponibilidad de Eliminar definitivamente. Historial muestra explicación. Delete se audita con actor ADMIN y entity_id del usuario eliminado.

## Catálogo y placas

Tab/Enter acepta única sugerencia o selección explícita por flechas; Tab mantiene salida del campo. Dos opciones sin selección no fuerzan valor. Texto libre permanece.

Placas: uppercase, elimina espacios/guiones, A-Z/0-9, 3..12. Schema compartido cubre vehículo, draft y close; EntitySearch deja de hardcodear ABC123. SQL CK_Vehicles_Plate se aplica al computed plate_normalized; conserva nvarchar(20), computed column y UX_Vehicles_Plate. Campo admite 20 caracteres visuales; el máximo efectivo normalizado es 12.

Fuentes oficiales consultadas: [Registro Nacional, Guía de Servicios Placas y Matrículas 2025](https://www.rnpdigital.cr/centroinforegistral/registros/direccion_servicios/Guias/Guia-de-Servicios-Placas-y-Matriculas-2025.pdf), [Hacienda DGH-007-2022](https://www.hacienda.go.cr/docs/COMUNICADO_DGH_007_2022.pdf). Respaldan distinguir clase/código y matrícula, y placas temporales/metálicas. El bound 3..12 es la decisión funcional aprobada para el taller, no una afirmación de formato registral oficial exhaustivo.

## Transferencia de dueño

Datos reales QA: cero auditorías VEHICLE_OWNER_CHANGED; hay órdenes con customer distinto de Vehicles.owner_id. Un autosave ordinario cambia el cliente de la orden, deliberadamente no transfiere el dueño maestro. Con esa evidencia no es posible atribuir el incidente reportado a una transferencia SQL confirmada ni afirmar que el defecto exacto quedó reproducido.

La reproducción exacta SQL con MECHANIC sí pasa: A/V, B, OPEN transfer-owner, owner_id=B, GET customerId=B incluye V, GET customerId=A excluye V, siguiente orden reutiliza V; historial anterior intacto. Prueba de interfaz para ADMIN y MECHANIC ahora recorre transferencia y selección de B en una nueva orden.

Se corrigió una carrera independiente y verificable en EntitySearch.selectCustomer: una respuesta tardía podía reemplazar vehículos/mensaje del cliente más reciente o actualizar después de desmontarse. Una prueba reproduce respuesta tardía de A después de seleccionar B y conserva vehículos de B. Cada selección lleva revisión de lookup; resultados obsoletos se descartan. La selección del vehículo y el desmontaje invalidan solicitudes pendientes. No se ha modificado el dueño real de ningún vehículo QA.

## Migraciones y cleanup

Aplicadas mediante pnpm db:migrate a tallerj5: 012_user_lockout.sql, 013_flexible_plates.sql, 014_username_check_pattern.sql. 014 corrige el guion literal del bracket SQL LIKE de 012; 012 ya estaba aplicada y se conservó intacta. No se editaron 001..011 ni migraciones una vez aplicadas. Runner registró checksums en SchemaMigrations.

Actualizados verify-sql.ts, cleanup 01/02/03 y README para 14 migraciones, columnas/constraints lockout y unicidad canónica. Los guards de 02 ocurren antes de borrar dentro de su transacción. Se conserva catálogo 57/986 y todas las columnas de ADMIN. Cleanup no ejecutado.

## Validación

- pnpm check: PASS; 257 pruebas unitarias/interfaz, typecheck backend/frontend y build/PWA. Las 32 integraciones se omiten aquí y se ejecutan por separado.
- pnpm test:sql: PASS; 32/32 pruebas SQL, 2 suites, 255.51 segundos. Todos los fixtures usan rollbackOnly=true.
- Reproducción SQL Phase 3 aislada: PASS, incluida transferencia y lookup nuevo/antiguo dueño.
- pnpm db:migrate: PASS, 012/013/014 aplicadas.
- pnpm --filter @j5/backend db:verify: PASS; 14 migraciones, 0 duplicados, índices/constraints habilitados y trusted, catálogo 57/986, 0 huérfanos.
- node scripts/generate-vehicle-catalog-sql.mjs --check: PASS. git diff --check: PASS. .env ignored, no tracked, no staged; staging vacío. HEAD sin cambios.

Pruebas nuevas: lockout 4/5 fallos, contraseña correcta durante bloqueo, expiración, reset previo al quinto, multi API instance/repository calls, cinco fallos concurrentes, rate limiter; reset/unlock/reactivación; retry después de COMMIT ambiguo; duplicados exactos/case/trim/rol y creación concurrente; mapeo SQL 2601/2627; DELETE inactive/active/history/self/replay; SQL FK constraints y API GET sin duplicate IDs; placas positivas y negativas unit/SQL; Tab/Enter y texto libre; confirm/show-hide/reset/filtro/unlock/delete en UI; transferencia seguido por siguiente orden.

## QA pendiente

Repetir en el navegador real el caso que originalmente no mostró el vehículo: confirmar explícitamente Actualizar dueño, verificar aviso y buscar B en la siguiente orden. Los datos previos no prueban transferencia completada; no se reasignaron vehículos arbitrariamente. UI/integración son pruebas automatizadas, no una ronda manual en el navegador desplegado. Probar show/hide con el password manager usado en el taller y revisar confirmaciones DELETE. Usuarios con cualquier historial/referencia permanecen ocultables, no eliminables. Receipts de login fallido crecen para usuarios existentes; se conserva política conservadora de no purgar receipts automáticamente.
## Seguimiento: ABC333 y cliente MDMDMD

Screenshot y placa confirmada por el usuario. SQL devuelve [] para customerId E26CD21F-1E5F-47A4-8A08-12BFA955DA8B, identificación 330303030, nombre MDMDMD. ABC333 (DDD1EAE9-13DF-4F0D-BCBD-5883A1FF8E43) sigue con owner_id F8EABFD0-665F-4D2A-B8BC-29C9B86FC1BE (Veronica Barquero). Historial tiene distintos clientes, incluyendo órdenes CLOSED de Mariangel, Cleo y finalmente MDMDMD; ninguna auditoría de transferencia del vehículo. Cambiar cliente en una orden y transferir dueño maestro son operaciones distintas.

Defecto concreto del frontend: el grupo Cambiar cliente manteniendo este vehículo requería selectedCustomer proveniente de búsqueda para mostrar Actualizar dueño, incluso cuando el cliente escrito manualmente ya estaba persistido y tenía customerId correcto. Se eliminó esa restricción; permanecen ID, vehículo, identificación válida, mismatch y validación transaccional de identidad del backend. Prueba reproduce cliente escrito y persistido por autosave sin selección de resultados. Texto explica confirmación pendiente. Cliente sin vehículos ahora tiene empty state honesto e instrucciones para buscar placa. Antes de avisar Dueño actual actualizado, performAction vuelve a consultar vehículo y verifica ownerId contra customerId; prueba rechaza un backend que devuelve éxito sin cambiar dueño.

Se agregó regresión SQL para A -> B -> C, nuevo lookup, exclusión de antiguos dueños, replay idempotente e historial intacto. pnpm check actualizado: PASS, 260 pruebas, tipos y build. Tanda SQL de órdenes actualizada: PASS, 10/10 pruebas rollback en 113.17 s, incluyendo A -> B -> C.

Repair preparado en repair-abc333-owner.sql, @Apply=0 por defecto. Actualiza solo vínculo ABC333->MDMDMD con guard del dueño anterior, auditoría actor NULL (sin atribuirlo a un usuario) y comparación completa del historial. NO EJECUTADO. Revisión automática rechazó ejecución persistente por requerir autorización explícita para la corrección de datos; se solicitó esa autorización al usuario.

## Seguimiento: cierre de Anthony y prevención del caso real

Consulta de solo lectura confirmó OT-20261010-15 CLOSED para Anthony Ramirez (customer_id 58387A71-8E42-40BC-957D-D6B95E4E70FC) con ABC333. Vehicles.owner_id sigue siendo Verónica y no existe auditoría de transferencia. Anthony usa la misma identidad de cliente de una orden antigua de Cleo; las órdenes conservan sus snapshots. No ocurrió una secuencia de tres transferencias confirmadas. El cierre aceptaba cliente distinto del dueño sin exigir una decisión, mientras que las pruebas previas recorrían únicamente la acción separada transfer-owner. Esa cobertura no prevenía el recorrido reportado.

Ahora Cerrar orden sincroniza el borrador y consulta el dueño actual. Si difiere del cliente, la confirmación muestra dueño anterior y nuevo cliente, con Asignar el vehículo al cliente seleccionado por defecto y la alternativa explícita Conservar dueño actual. Confirmar envía ownerResolution (decision, vehicleId, customerId, expectedOwnerId) en la misma solicitud de cierre. El backend bloquea cierres ambiguos con OWNER_DECISION_REQUIRED y decisiones obsoletas con OWNER_DECISION_STALE. UPDATE del dueño, auditoría, orden y contacto pertenecen a la misma transacción/savepoint: cualquier rechazo revierte todo. La decisión se elimina del borrador persistido y del estado local al completarse o rechazarse, pero se conserva exactamente en la solicitud pendiente durante desconexión/replay. Historial previo no cambia; autosave por sí mismo no transfiere.

La nueva prueba SQL con placa de 12 caracteres detectó otra omisión de la ronda original: TR_Orders_Guard todavía exigía ABC123 al cerrar. Se agregó y aplicó 015_flexible_order_plate_guard.sql, copiando los guardas vigentes de 009 y cambiando únicamente la validación de plate_snapshot a 3..12 A-Z/0-9. No se editó ninguna migración aplicada. db:verify y los tres scripts de cleanup ahora requieren 15 migraciones y verifican que el trigger de cierre esté habilitado y actualizado. Catálogo 57/986 preservado.

Pruebas nuevas: cierre normal con transferencia seguido de selección del cliente en nueva orden; conservar dueño explícitamente; conflicto de dueño al confirmar; recuperación tras pérdida de respuesta y rechazo sin bloquear borrador; SQL cierre A -> B -> C, decisión requerida/obsoleta, rollback después de actualizar dueño, historial intacto, auditorías únicas y conservar dueño; trigger de cierre con todos los ejemplos aprobados y negativos. Resultados finales se registran al completar la validación.

La propuesta repair-abc333-owner.sql fue actualizada para Anthony y reemplaza la propuesta MDMDMD nunca ejecutada. Exige identidad exacta, orden CLOSED de Anthony, dueño esperado y comparación del historial; @Apply=0 por defecto. Sigue pendiente de autorización explícita para COMMIT de esa reparación de datos, debido al rechazo previo de aprobación automática. No se hizo cleanup real, commit, merge ni push.

### Resultados finales de este seguimiento

- pnpm check: PASS, 266 pruebas, tipos backend/frontend y build/PWA. 39 integraciones omitidas aquí y ejecutadas separadamente.
- pnpm test:sql: PASS, 39/39, 2 suites, 376.12 segundos, todos los fixtures rollback-only. Incluye cierre A -> B -> C (23.55 s) y guardas de placas flexibles.
- Pruebas dirigidas de interfaz/autosave: PASS, 83/83, incluido rechazo por dueño modificado y replay exacto tras pérdida de respuesta.
- pnpm db:migrate: PASS, 015 aplicada por runner normal; migraciones anteriores intactas.
- Catálogo generado --check: PASS. git diff --check: PASS. .env ignored, no tracked ni staged; staging vacío. Branch feature/orders-mvp, HEAD fb50e8e sin cambios.
- Pendiente: confirmación del usuario para reparación ABC333 -> Anthony; no ejecutada. QA manual en el navegador con la versión actualizada, especialmente la nueva confirmación al cerrar.
- pnpm --filter @j5/backend db:verify: PASS; 15 migraciones, catálogo 57/986, cero duplicados/huérfanos, constraints trusted y triggers habilitados.

## Seguimiento: primer login con SQL serverless y ajustes visuales

El usuario confirmó que el flujo de asignación del dueño y las placas flexibles funcionan en su QA. Para login, api.ts ahora reintenta errores temporales 408/502/503/504 y conexión durante una ventana total de 60 segundos, con cada fetch limitado al tiempo restante. Respeta Retry-After dentro de esa ventana; no reintenta 400/401/403/429. El primer intervalo es 5 segundos y los siguientes 10, sin cambiar el body de credenciales. Al agotarse el minuto devuelve LOGIN_SERVICE_UNAVAILABLE y el mensaje pide reportar a soporte.

App conserva usuario/contraseña durante la espera y ante un error, limpia contraseña al entrar correctamente, deshabilita los campos durante el envío y muestra el tiempo posible de inicio. Login usa input password con autocomplete current-password y el control nativo del navegador; se retiró Mostrar adicional solamente del login. Crear/reset mantienen sus controles existentes. El filtro Mostrar usuarios inactivos usa checkbox de 20 px y etiqueta inline-flex junto al texto, con área de etiqueta de 44 px.

Validación: pnpm check PASS, 275 pruebas, tipos y build/PWA. Pruebas nuevas cubren servicio caído durante 60 s, recuperación a los 45 s, Retry-After largo, fallos de red, no reintentar rechazos de seguridad y conservación de credenciales/ausencia de Mostrar en UI. git diff --check PASS; .env ignored/untracked y staging vacío. Cambios solo frontend; no requiere migración ni otra tanda SQL. No commit/merge/push.

## Seguimiento: reset y aviso inmediato de coincidencia

Se retiraron los botones Mostrar/Ocultar de los dos campos del reset; ambos usan input password con autocomplete new-password y el control nativo del navegador. Al comenzar a editar la confirmación, creación y reset muestran un banner accesible si las contraseñas difieren. Desaparece al coincidir y reaparece si se modifica cualquiera, incluso al borrar la confirmación. Los avisos de cada formulario tienen estado independiente; al abrir otro reset se limpian. La política de longitud/bytes y el bloqueo de submit siguen vigentes; confirmación no se envía al API.

pnpm check PASS: 277 pruebas, typecheck y build/PWA. Pruebas dirigidas cubren aviso en vivo, cambios de contraseña original, borrar confirmación, nuevo reset limpio, ausencia de botones extra y autocomplete. git diff --check PASS, staging vacío. Sin cambios SQL, commit, merge ni push.

## Seguimiento: creación sin Mostrar y alcance de avisos de edición

Creación usa input password en ambos campos con autocomplete new-password; se retiraron los botones Mostrar adicionales. Se mantienen el banner de coincidencia en vivo y la validación antes de enviar.

El aviso de otra pestaña y los errores de soporte de locks/almacenamiento usaban globalMessage durante el inicio de sesión, por lo que aparecían en Usuarios. Ahora usan editorAccessMessage, se muestran solamente en Inicio y pantallas de órdenes, y se limpian al finalizar la sesión. Un rechazo tardío de navigator.locks.request también se maneja sin filtrar el aviso a Usuarios. No se cambió el bloqueo entre pestañas ni su duración. Revisados los avisos de acciones, guardado y conflictos: conservan página/orden y descarte de reportes tardíos; sesión y conectividad mantienen su alcance general porque afectan toda la aplicación.

Validación: typecheck PASS; pnpm check encontró 17 timeouts de 5 s en pruebas bcrypt bajo carga (las suites de interfaz pasaron). Repetición de todas las pruebas sin suites en paralelo y con timeout CLI de 20 s: PASS 279/279, 39 integraciones omitidas. No se cambió configuración ni seguridad del producto. pnpm build PASS y git diff --check PASS; staging vacío, HEAD fb50e8e. Pruebas nuevas cubren aviso de lock en órdenes, ocultarlo en Usuarios/login y rechazos tardíos estando en Usuarios. Sin cambios SQL, commit, merge ni push.
