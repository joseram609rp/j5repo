# Frenos La Bandera

PWA React/TypeScript/Vite y API Node/TypeScript para el taller. Phase 2 implementa Azure SQL, autenticación persistente y API mínima. Rama de trabajo: feature/backend-foundation. No se desplegó a Azure y no hay UI completa de órdenes.

## Estado de validación

Implementación y pruebas locales disponibles. **Conexión, migraciones y funcionamiento contra tallerj5 pendientes de validación**, por decisión del propietario; no había .env local. Los tests normales no contactan Azure. Ver [verificación](docs/verification.md).

## Preparación local

Requiere Node 22.12+ (<25) y pnpm 11.19.0.

1. Ejecutar **pnpm install --frozen-lockfile**.
2. Copiar .env.example a .env en la raíz. Completar SQL_USER y SQL_PASSWORD localmente. Usar SQL_AUTH_MODE=sql, servidor j5sqlserver.database.windows.net y base tallerj5.
3. Revisar [migraciones y permisos](database/README.md). Ejecutar **pnpm db:migrate** con una cuenta autorizada para DDL. Si ya existen tablas incompatibles, la migración falla y revierte; nunca borra tablas.
4. Ejecutar **pnpm admin:create** en una terminal interactiva. Solicita usuario y contraseña oculta, sin argumentos de contraseña. Solo permite bootstrap cuando no existe ADMIN activo.
5. Ejecutar **pnpm dev**; abrir http://localhost:5173. API en http://127.0.0.1:7071. Iniciar sesión con el administrador creado.

SQL debe permitir la IP local en su firewall. No usar credenciales administrativas de migración como identidad normal del servicio. El servidor lee .env de la raíz; jamás colocar secretos en VITE_*. .env y local.settings.json están ignorados por Git. Si pnpm no está en PATH, usar scripts/pnpm.ps1 con el comando deseado.

La UI permite autenticarse y probar el borrador existente. Los usuarios se administran por API durante esta fase. No existe acceso demo ni almacenamiento en memoria en el runtime. Sin SQL configurado, health devuelve 503.

## Comandos

- **pnpm check**: tipos, pruebas automáticas y compilaciones backend/frontend/PWA.
- **pnpm test**: pruebas locales, sin conexión SQL.
- **pnpm db:migrate**: aplica migraciones numeradas en una transacción, registra checksums y detecta cambios en migraciones ya aplicadas.
- **pnpm admin:create**: crea el primer administrador; bcrypt coste 12.
- **pnpm test:sql**: prueba explícita contra SQL configurado; requiere migraciones aplicadas. Solo fixtures nuevos, transacciones con ROLLBACK; ver límites en database/README.md.

Sesiones: token aleatorio solo en cookie HttpOnly/SameSite=Strict; Secure en producción. SQL almacena SHA-256 del token. Inactividad máxima fija de dos horas; GET, polling y autosave no renuevan. Solo actividad de usuario notificada por el cliente renueva una sesión aún vigente. Logout, desactivación, cambio de rol y reset de contraseña revocan sesiones.

## API mínima

Todas las mutaciones requieren Origin=APP_ORIGIN. Salvo login, requieren cookie y X-CSRF-Token. Crear/modificar usuarios y guardar órdenes también requieren Idempotency-Key UUID. Las respuestas no se cachean.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | /api/health | Conectividad SQL; 503 y Retry-After al agotar reintentos |
| POST | /api/auth/login | JSON username/password; devuelve usuario, csrf, lastActivity, idleMs; cookie opaca |
| GET | /api/auth/me | Sesión y rol actuales |
| POST | /api/auth/activity | Renueva solo una sesión vigente; sin body |
| POST | /api/auth/logout | Revoca sesión y elimina cookie |
| GET | /api/admin/users | ADMIN: lista sin hashes |
| POST | /api/admin/users | ADMIN: JSON username/password/role |
| PATCH | /api/admin/users/:uuid | ADMIN: active, role y/o password; impide eliminar el último ADMIN activo |
| GET | /api/orders/:uuid | Lee borrador con ETag |
| PUT | /api/orders/:uuid | Guarda borrador; If-Match obligatorio al actualizar |

Se conservan GET/DELETE /api/session y POST /api/session/activity como aliases. PUT /orders admite customerName, plate, mileage nullable, notes, recommendations y customerId/vehicleId opcionales. Roles válidos: ADMIN y MECHANIC. Ambos leen/guardan borradores abiertos del taller; no hay restricciones por mecánico asignado en esta fase. Las órdenes cerradas no se modifican por esta API.

Ver [arquitectura](docs/architecture.md), [base de datos](database/README.md) e [infraestructura](infra/README.md).
