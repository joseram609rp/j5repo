# Frenos La Bandera

PWA React/TypeScript/Vite y API Node/TypeScript para el taller. Phase 3 implementa Orders MVP: login → dashboard → crear nueva orden/continuar cualquiera → autosave → órdenes abiertas → cierre → detalle de solo lectura → historial. Rama de revisión: `feature/orders-mvp`. Sin despliegue Azure.

## Uso

- **Nueva orden** crea una OPEN en SQL y conserva su UUID en IndexedDB. Cada acción explícita crea una orden distinta aunque haya otras OPEN. Refresh/login/re-render no crean órdenes.
- **Órdenes abiertas** muestra órdenes de todos los mecánicos, más recientes primero. **Continuar** carga su detalle y ETag. Incluye copias locales pendientes sin sobrescribir otras órdenes. ADMIN puede reasignar OPEN a usuarios activos MECHANIC o ADMIN; ambos roles pueden trabajar como mecánicos. CLOSED no admite reasignación, ni mediante reopen/admin-edit.
- **Historial** inicia vacío y no consulta SQL hasta recibir al menos dos caracteres. Busca CLOSED por OT, placa, cédula o nombre y abre detalles de solo lectura. Listas en páginas de 50, con cursor estable por orden.
- Buscar cliente/vehículo por cédula, nombre o placa y seleccionar una coincidencia carga los datos. Seleccionar un vehículo mantiene el cliente ya elegido y muestra la diferencia con el dueño actual; sin cliente elegido, carga su dueño actual; seleccionar cliente permite elegir sus vehículos. Clientes/vehículos nuevos se crean cuando sus datos son válidos, reutilizando cédula/placa únicas. Los cambios del formulario son snapshots de la orden; no sobrescriben indiscriminadamente el catálogo.
- **Cerrar orden** valida todas las secciones, muestra errores inline y resumen, sincroniza los cambios y solicita confirmación con OT y total. El servidor calcula el total oficial; CLOSED queda bloqueada. Solo ADMIN puede confirmar **Reabrir orden**.
- **Usuarios**, visible solo para ADMIN, lista y crea ADMIN/MECHANIC; permite activar/desactivar, cambiar rol y resetear contraseñas de otros usuarios con confirmación. Se conserva la protección del último ADMIN activo y la revocación de sesiones.
- Para un cambio de dueño: seleccionar el vehículo; usar **Cambiar cliente manteniendo este vehículo**; buscar/seleccionar o completar el nuevo cliente; esperar guardado. Si dueño y cliente difieren se muestran sus nombres y **Mantener dueño actual**; ADMIN también ve **Actualizar dueño a [nombre]**, con confirmación. Guardar una orden por sí solo nunca cambia `Vehicles.owner_id`; las órdenes anteriores conservan su cliente.

Logo real J5 y azul/rojo, botones de al menos 48 px, campos apilados en móvil. Sin slogans ni footer decorativo.

## Preparación local

Node 22.12+ (<25) y pnpm 11.19.0.

1. `pnpm install --frozen-lockfile`.
2. Copiar `.env.example` a `.env` en la raíz y completar las credenciales localmente. Nunca usar secretos en `VITE_*`.
3. `pnpm db:migrate` con una cuenta autorizada para DDL. Las migraciones 001–006 permanecen intactas; 007 retira la obligación de observaciones y deja año >=1950; 008 permite reasignar OPEN mediante operación ADMIN autorizada. Ver [base de datos](database/README.md).
4. Solo en instalaciones sin ADMIN: `pnpm admin:create` desde una terminal interactiva; contraseña oculta, sin argumentos.
5. `pnpm dev` y abrir `http://localhost:5173`. API local en `http://127.0.0.1:7071`; APP_ORIGIN debe coincidir exactamente.

SQL requiere firewall para la IP local. El runtime usa SQL real, no una base en memoria ni un acceso demo. Health devuelve 503 si SQL no está disponible. `.env` y `local.settings.json` están ignorados por Git.

## Verificación

- `pnpm check`: tipos, tests locales y compilación backend/frontend/PWA.
- `pnpm db:migrate`: migraciones transaccionales con checksums/applock.
- `pnpm --filter @j5/backend db:verify`: metadata y conteo de ADMIN, sin listar cuentas o hashes.
- `pnpm test:sql`: ambas suites SQL, secuencialmente, con fixtures nuevos y rollback. Para aislar Phase 3: `pnpm test:sql backend/test/orders-sql.integration.test.ts`.

Resultados y límites en [verificación](docs/verification.md). Las pruebas SQL no confirman un COMMIT real ni sustituyen pruebas de concurrencia entre procesos.

## API

Todas las mutaciones requieren Origin=APP_ORIGIN. Salvo login, requieren cookie y X-CSRF-Token. Usuarios y órdenes requieren Idempotency-Key UUID. Actualizar una orden requiere If-Match con ETag; respuestas sin caché.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | /api/health | Conectividad SQL |
| POST | /api/auth/login | username/password; cookie opaca, CSRF y datos de sesión |
| GET | /api/auth/me | Usuario/rol/sesión |
| POST | /api/auth/activity | Actividad explícita en sesión vigente |
| POST | /api/auth/logout | Revoca sesión |
| GET | /api/orders?status=OPEN\|CLOSED&q=...&before=uuid | Lista/búsqueda; CLOSED exige q de mínimo 2 caracteres; máximo 50, cursor before |
| GET | /api/orders/:uuid | Detalle, ETag, apertura/cierre, mecánico y total |
| PUT | /api/orders/:uuid | Crear/guardar, mechanicId opcional para reasignar OPEN solo ADMIN, acciones close/reopen/transfer-owner; ETag e idempotencia |
| GET | /api/customers?q=... | Cédula exacta o nombre parcial case/accent-insensitive; máximo 20, mínimo 2 caracteres |
| GET | /api/vehicles?q=... | Placa exacta normalizada, mínimo 3 caracteres; devuelve dueño actual |
| GET | /api/vehicles?customerId=uuid | Vehículos del cliente, máximo 20 |
| GET/POST | /api/admin/users | ADMIN: listar/crear, sin hashes en respuesta |
| PATCH | /api/admin/users/:uuid | ADMIN: active/role/password/fullName |

GET/DELETE `/api/session` y POST `/api/session/activity` siguen como aliases. `void` y `admin-edit` siguen disponibles en backend solo para ADMIN; no tienen UI en esta fase.

Datos de cierre: nombre requerido, cédula 9 dígitos, teléfono 8, email opcional válido, placa ABC123, marca/modelo, año entero >=1950, sin máximo funcional (almacenado como int SQL), kilometraje entero 0..10,000,000, al menos un trabajo con descripción/precio positivo Observaciones y recomendaciones opcionales. Valores incompletos/incorrectos se conservan localmente; SQL autosave espera payload válido. Kilometraje y precios siguen numéricos; previews `128,400 km` y CRC no alteran el payload.

El servidor asigna mechanic_id y recalcula SUM(OrderItems.price). MECHANIC puede editar OPEN del taller y no modificar CLOSED; reopen/transfer-owner/void/admin-edit requieren ADMIN. El dueño actual solo se cambia mediante `action=transfer-owner`, con identidad exacta de cliente/vehículo, ETag, idempotencia y auditoría.

## Persistencia y sesión

IndexedDB mantiene registros por clave compuesta [userId, orderId], migrando atómicamente el borrador legacy por usuario sin descartarlo; payload/clave/ETag pendientes y metadata de la orden. El cierre se persiste antes del envío; una respuesta perdida se recupera con la misma clave. Se protege el borrador antes de cambiar de orden. Un conflicto conserva la copia y detiene sync para revisión; la recuperación guiada de conflictos queda para Phase 4.

Estados: Guardado, Sincronizando, copia local/offline y error. Retry manual aparece solo ante fallo recuperable; al volver la conexión se reintenta automáticamente. Un Web Lock por usuario evita dos editores locales simultáneos.

Sesión: cookie HttpOnly/SameSite=Strict y Secure en producción; SQL guarda hash del token. Inactividad de dos horas, sin renovación por GET/autosave. Logout, cambio de rol, desactivación y reset revocan sesiones.

## Phase 4

Recuperación guiada de conflictos, anulación/correcciones administrativas avanzadas, reportes, catálogos más amplios, retención de recibos/sesiones y pruebas de COMMIT ambiguo/concurrencia entre procesos. Antes de producción: configuración HTTPS/Functions/Managed Identity, permisos SQL mínimos, limitador compartido y pruebas PWA en dispositivos reales.

Ver [arquitectura](docs/architecture.md) e [infraestructura](infra/README.md).

Búsqueda de órdenes: nombres parciales con collation Latin1_General_100_CI_AI; cédula exacta (trim) y placa exacta normalizada (uppercase sin espacios/guiones). display_order_id admite prefijo literal. CHARINDEX/LEFT usan parámetros, sin LIKE: %, _ y [ son caracteres literales. Las páginas SQL se limitan a 50, ordenadas por created_at y order_number para desempatar; Cargar más envía before con el último UUID. Una página exacta de 50 puede mostrar Cargar más y terminar en una página vacía.

Reasignación: AuditLogs guarda actor_id, entity_id de la orden y action=ORDER_MECHANIC:<nuevo UUID> (menos de 64 caracteres). No requiere ampliar schema. El mecánico actual viaja en Order.mechanicId; el campo Draft.mechanicId es una intención de cambio y se retira del borrador al guardar.

CarsXE, catálogos de marcas/modelos y llamadas externas permanecen fuera de esta fase.
