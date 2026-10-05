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
