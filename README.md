# Frenos La Bandera / J5

PWA para un taller de mecánica rápida de una sucursal. Incluye usuarios, clientes, vehículos, órdenes del día, registro de órdenes anteriores, recuperación offline e historial.

## Arquitectura

React + TypeScript + Vite/PWA en Azure Static Web Apps Free; API Node.js/TypeScript con Managed Azure Functions y Azure SQL Free/serverless. IndexedDB conserva borradores y sugerencias en el dispositivo. SQL es la fuente oficial; el runtime no usa una base demo.

```text
Navegador / PWA React
  |-- IndexedDB: borradores, pendientes, recuperación, catálogo
  `-- /api (mismo origen, cookie + CSRF)
        `-- Azure Functions / API TypeScript
              `-- Azure SQL (transacciones, guards, rowversion)
```

| Carpeta | Contenido |
| --- | --- |
| frontend/ | Interfaz, PWA, sesión, cola local y pruebas UI |
| backend/ | API local/Functions, repositorio SQL, auth y pruebas |
| database/ | Migraciones inmutables y consultas de referencia |
| clean up/ | Herramientas destructivas exclusivas DEV/QA y safety docs |
| data/vehicle-catalog/ | Seed, fuentes, evidencia y procedencia del catálogo |
| docs/ | Arquitectura, verificación, correcciones técnicas y seguridad |
| scripts/ | Herramientas SQL y generación/validación del catálogo |
| infra/ | Configuración y verificación de despliegues |
| shared/, images/ | Recursos compartidos y logo original |

## Preparación local

Requiere Node `>=22.12.0 <25` y pnpm `11.19.0`. Para Azure, el archivo de SWA selecciona Node 22.

```powershell
Copy-Item .env.example .env
# Completar .env localmente: APP_ORIGIN=http://localhost:5173 y configuración SQL.
pnpm install --frozen-lockfile
pnpm db:migrate
# Solo si todavía no existe un ADMIN activo, en terminal interactiva:
pnpm admin:create
pnpm dev
```

Abrir `http://localhost:5173`. La API local escucha en `http://127.0.0.1:7071`; Vite deriva `/api` a esa API. `APP_ORIGIN` debe coincidir exactamente con el origen del navegador. SQL necesita permitir la IP local en su firewall. Las migraciones requieren permisos DDL; el runtime debe tener una identidad distinta con permisos mínimos. No se ejecutan migraciones al iniciar la API. `admin:create` solicita contraseña oculta, sin argumentos ni credenciales en el historial de la terminal.

## Variables de entorno

`.env.example` contiene exclusivamente nombres y campos vacíos. Completar valores en `.env`, que está ignorado por Git; los defaults de timeouts están en backend/src/config.ts. Omitir las variables opcionales en lugar de dejarlas vacías en el entorno efectivo.

| Nombre | Propósito |
| --- | --- |
| APP_ORIGIN | Origen exacto autorizado; localhost en desarrollo, HTTPS en Azure |
| SQL_SERVER / SQL_DATABASE | Servidor y base SQL de destino |
| SQL_AUTH_MODE | `sql` para credenciales locales o `default` para identidad Azure/Entra |
| SQL_USER / SQL_PASSWORD | Solo para modo `sql`; secretos exclusivos del backend |
| SQL_CONNECT_TIMEOUT_MS | Timeout de conexión; default y máximo 5000 ms |
| SQL_REQUEST_TIMEOUT_MS | Timeout por comando; default y máximo 5000 ms |
| SQL_RETRY_BUDGET_MS | Presupuesto SQL por petición; default y máximo 28000 ms |
| CARSXE_API_KEY | Solo tooling de investigación del catálogo; no necesaria en runtime |
| NODE_ENV | `production` para cookie Secure fuera de detección del host Azure |
| WEBSITE_INSTANCE_ID | Señal automática del host Azure utilizada para cookie Secure |
| J5_SQL_INTEGRATION | Flag del runner de pruebas SQL; no requerido en runtime |

Nunca colocar secretos en `VITE_*`: cualquier valor incorporado al frontend queda público. No committear `.env`, `local.settings.json`, claves, tokens ni connection strings. Si se filtra un secreto, revocarlo/rotarlo inmediatamente; borrar un archivo no invalida una credencial ni limpia el historial Git.

## Base de datos

Existen **18 migraciones, 001–018**. El runner usa transacción, applock y checksums SHA-256; rechaza historia ausente o alterada. Agregar migraciones nuevas para cambios futuros, sin editar las aplicadas.

Los hitos son core/rowversion (001), recibos y auditoría (002), guards históricos/totales (003), modelo del vehículo (004), notas de cierre (005, requisito retirado por 007), selección corregible en OPEN (006), notas opcionales y año >=1950 (007), reasignación (008), pago/IVA/notas por trabajo (009), catálogo (010), numeración diaria (011), lockout (012), placas flexibles (013), constraint de username (014), guard flexible de placa al cerrar (015), cédulas jurídicas (016), archivo histórico (017) y órdenes anteriores (018). [Detalle y permisos](database/README.md).

## Autenticación y seguridad

Contraseñas nuevas: mínimo 12 caracteres, máximo 72 bytes UTF-8; bcrypt coste 12. Login usa comparación ficticia cuando corresponde y una respuesta genérica de credenciales inválidas. Username normalizado a minúsculas con unicidad SQL; 3–64 caracteres ASCII alfanuméricos, punto, guion y guion bajo.

Sesión opaca criptográfica: SQL conserva solo el hash del token. Cookie `HttpOnly`, `SameSite=Strict`, `Path=/api` y `Secure` en producción. Expira tras **dos horas de inactividad**. Solo actividad explícita renueva una sesión vigente; GET, polling, foco y autosave no lo hacen. Logout, cambio de rol, desactivación y reset de contraseña revocan sesiones.

Toda mutación exige Origin exacto; salvo login, también CSRF de sesión. Cinco fallos de login bloquean la cuenta 15 minutos, persistidos en SQL. ADMIN puede desbloquear; reset/reactivación limpian el bloqueo. Hay límites adicionales por proceso: 15 intentos por username en cinco minutos y 100 globales/minuto. SQL sigue siendo autoridad del lockout entre instancias; el límite global distribuido queda pendiente.

API con respuestas `no-store`, SQL parametrizado, roles comprobados en cada petición, receipts idempotentes y control de versión. SWA agrega CSP restrictiva, bloqueo de frames, nosniff y referrer-policy. Service worker no cachea API ni credenciales. [Revisión y limitaciones](docs/security-review.md).

## Roles y usuarios

Todos los usuarios autenticados ven y editan las OPEN del taller. MECHANIC puede cerrar/cancelar solo la OPEN asignada; ADMIN puede hacerlo en cualquiera. ADMIN gestiona usuarios, reasigna OPEN a usuarios activos ADMIN/MECHANIC y reabre CLOSED. `admin-edit` existe en backend para correcciones administrativas; no hay una pantalla avanzada para esa acción.

Transferir dueño está permitido a **MECHANIC y ADMIN autenticados**, mediante acción explícita o decisión de cierre validada. No ocurre en autosave. Inactivos se ocultan por defecto en Usuarios. Borrado físico exige usuario inactivo sin referencias/historia y no permite autoborrado; quienes tienen historia se conservan. El último ADMIN activo no puede desactivarse/degradarse. Reset de contraseña revoca todas las sesiones del destinatario.

## Ciclo de órdenes

`OPEN -> CLOSED` al cierre; `OPEN -> VOID` al cancelar; ADMIN puede reabrir una orden del día cerrada. VOID conserva datos y auditoría, desaparece de abiertas y no integra el historial normal de CLOSED. CLOSED/VOID no admiten reasignación. **Nueva orden → Orden del día** crea una OPEN distinta. ADMIN también puede elegir **Orden anterior**, que queda como borrador local con una fecha de trabajo anterior a hoy en Costa Rica. Al confirmar se registra directamente como CLOSED y recibe su número oficial.

**Vista previa de orden** valida los datos de cierre, los trabajos, el método de pago y la elección de factura electrónica. Muestra cliente, vehículo, servicios, subtotal, IVA, total y la fecha del negocio o del trabajo. Es un resumen para revisar con el cliente. **Volver a editar** conserva el borrador y **Confirmar y cerrar orden** solicita el cierre oficial. Para una orden del día, la aplicación sincroniza antes de preparar la vista y permite elegir entre transferir o conservar el dueño actual si difiere del cliente. SQL verifica esa decisión dentro de la transacción.

Identificador visible `OT-YYYYMMDD-NN`: fecha local UTC-6, consecutivo diario de al menos dos dígitos, sin truncar números mayores de 99. UUID sigue siendo identidad técnica y order_number global sirve para desempate. Historial inicia vacío y busca órdenes CLOSED por texto, rango de fechas o ambos. El texto requiere al menos dos caracteres y admite prefijo de OT, nombre parcial, cédula exacta o placa normalizada exacta. Al combinar texto y fechas se aplican ambos filtros. Las páginas contienen hasta 50 resultados. El archivo histórico importado se consulta en su módulo de solo lectura. [Contratos](docs/architecture.md).

## Clientes y vehículos

La cédula única identifica al cliente. Un cierre válido actualiza nombre/teléfono/email del maestro, sin alterar la cédula; los snapshots de órdenes previas conservan el contacto histórico. Autosave no sobrescribe el contacto actual de clientes existentes. La selección de vehículo permite conservar un cliente elegido y decidir el dueño explícitamente. Las coincidencias reutilizan clientes/vehículos por cédula/placa.

Último kilometraje: lectura más reciente no nula entre órdenes del vehículo, incluidas VOID y excluidas las órdenes anteriores registradas retroactivamente; una orden posterior vacía no elimina la lectura anterior. Se usa como referencia del formulario, sin acreditar kilometraje real.

Placas: mayúsculas, sin espacios/guiones, **3–12 caracteres alfanuméricos ASCII normalizados**. Ejemplos sintéticos: `AB-123` se normaliza a `AB123`; `XYZ 9` a `XYZ9`. Es una regla flexible de captura para Costa Rica, no una afirmación exhaustiva sobre registros legales. Año entero >=1950; kilometraje entero 0..10,000,000. Cierre exige nombre, cédula de 9 dígitos (física) o 10 (jurídica), teléfono de 8, email opcional válido, marca/modelo/año/placa, kilometraje y al menos un trabajo con precio positivo.

## Catálogo

Seed de **57 marcas y 986 modelos**, basado en CarsXE y evidencia de mercado CR. Las fuentes/provenance se conservan en [data/vehicle-catalog](data/vehicle-catalog/README.md). No hay dependencia CarsXE en runtime. Autocomplete es ayuda de escritura: marca/modelo manual siguen permitidos.

API devuelve catálogo activo dinámico; 57/986 son invariantes del seed/cleanup, no restricciones de cada lectura. IndexedDB cachea sugerencias por siete días, con fallback legacy y refresh al reconectar. Reintentos HTTP limitados a cuatro, timeout 35 s por petición y presupuesto 120 s para tolerar cold start. La entrada manual funciona aun sin catálogo.

## Campos e importes

Moneda CRC. Cada trabajo lleva descripción, precio sin IVA y observación opcional; notas/recomendaciones generales también son opcionales. IVA 13%, redondeado por línea a centavos; SQL calcula subtotal, impuesto y total oficiales. Totales/tasa del cliente no se aceptan como autoridad. Importes históricos previos a 009 mantienen su tasa original.

Pago: SINPE, tarjeta de crédito, tarjeta de débito, efectivo o transferencia bancaria (`SINPE`, `CREDIT_CARD`, `DEBIT_CARD`, `CASH`, `BANK_TRANSFER`). Factura electrónica exige elegir Sí/No al cerrar; el booleano registra el requerimiento y **no emite facturas ni integra un proveedor**.

## Autosave, offline y concurrencia

IndexedDB separa borradores por usuario/orden y conserva payload, ETag, clave idempotente, pendientes y copias de recuperación. Datos incompletos se conservan localmente; SQL autosave espera payload válido. Crear/cerrar necesitan conexión para confirmación oficial. Tras una respuesta perdida, se reenvía la misma mutación/clave; no se duplican efectos. Las revisiones optimistas de IndexedDB detectan escrituras concurrentes entre pestañas y conservan una copia recuperable cuando hay conflicto. La vista previa bloquea el cierre si cambia la revisión local o el ETag. Vuelve a editar y abre una nueva vista para revisar los datos actualizados.

Las órdenes del día y los borradores de órdenes anteriores se actualizan silenciosamente entre pestañas al recibir cambios guardados en IndexedDB. Los borradores anteriores permanecen locales hasta confirmar el cierre. Una cancelación compartida deshabilita el formulario y retira las acciones y validaciones de cierre. Los avisos del editor y las descargas de recuperación aparecen únicamente en el contexto de su orden; Historial consulta las órdenes cerradas por placa, nombre, cédula o fecha.

ETag se deriva de rowversion. Un conflicto conserva el borrador, consulta la versión actual y ofrece revisión por grupos/mezcla/servidor. La copia previa permanece en recoveryCopies y puede descargarse; una nueva modificación remota obliga a revisar de nuevo. Las acciones de cierre, cancelación y transferencia no se repiten automáticamente al resolver contenido. Reasignación sin cambio de contenido puede recuperarse con versión/clave nuevas.

SQL serverless tiene retry de errores transitorios con presupuesto total 28 s; agotarlo devuelve 503. La PWA solicita actualización explícita y trata de sincronizar antes de activarla; pendientes/conflictos bloquean la actualización. Logout no garantiza eliminación de borradores: IndexedDB es persistencia del dispositivo, no aislamiento frente a quien controle su perfil de navegador. Usar dispositivos/perfiles de confianza y [limpieza local](clean%20up/04_clear_local_cache.md) después de proteger trabajo pendiente.

## Verificación

```powershell
pnpm check
pnpm test:sql
pnpm --filter @j5/backend db:verify
node scripts/generate-vehicle-catalog-sql.mjs --check
pnpm audit
git diff --check
```

`check` incluye tipos, unitarias/UI y builds; las suites SQL se omiten por diseño. `test:sql` habilita ambas suites secuencialmente, con fixtures y rollback-only: no demuestra COMMIT ambiguo ni carga real entre procesos. `db:verify` inspecciona metadata, constraints, catálogo y migraciones. [Resultados de esta revisión](docs/verification.md).

## Limpieza DEV/QA

Los scripts de [limpieza DEV/QA](clean%20up/README.md) corresponden al esquema 001–015. Sus comprobaciones rechazan el esquema actual 001–018. Borrar datos de SQL y limpiar IndexedDB son operaciones independientes.

## Git y despliegue

`dev` integra cambios mediante PR y despliega el entorno de pruebas. Tras verificarlo, un PR de `dev` a `prod` promueve la versión. GitHub Actions despliega ambas ramas en Azure Static Web Apps y genera una vista temporal para PR hacia `prod`. [Infraestructura](infra/README.md).

## Privacidad del repositorio público

Se retiraron reparaciones puntuales y reportes QA identificables del HEAD y se sustituyeron relatos de ejecución por documentación técnica. **Commits anteriores aún pueden contener esos artefactos.** No se reescribió historial ni se hizo force-push; cualquier tratamiento del historial requiere autorización adicional explícita. No publicar nombres/cédulas/contactos/placas/UUIDs de casos operativos; usar fixtures sintéticas para documentación y pruebas.
