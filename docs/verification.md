# Verificación Phase 2 — 2026-10-03

## Resultado local

pnpm check final: tipos frontend/backend correctos, **40 pruebas aprobadas**, **2 pruebas SQL omitidas** y builds frontend/backend/PWA correctos. La suite SQL solo se activa con pnpm test:sql y configuración explícita.

Cobertura automática:
- Bcrypt, password incorrecto/usuario inactivo, cookie segura y token hasheado.
- ADMIN/MECHANIC, CSRF/Origin, logout repetible, revocación y último ADMIN protegido.
- Límite exacto a 7 200 000 ms, actividad renueva; GET/autosave no renuevan ni reactivan sesiones.
- Administración de usuarios, reset efectivo de password y revocación por cambio de rol/desactivación.
- Replay, conflicto de payload/If-Match/ruta, claves por usuario, solicitudes concurrentes en el doble transaccional.
- 412/428 y rollback de orden/auditoría cuando falla la persistencia del comprobante.
- Clasificación transitoria anidada, presupuesto de reintentos, backoff efectivo, cancelación y no retry de login SQL.
- Driver simulado: TLS, consultas parametrizadas, request.cancel, SERIALIZABLE, rollback y timestamps datetime2(3).
- Cola frontend: respuesta perdida, recuperación, versión opaca, conflicto, fallo local y espera de envío en vuelo.

Prueba adicional del servidor compilado por HTTP local: GET /api/health sin SQL configurado devuelve 503 + Retry-After: 3; login con Origin ajeno devuelve 403. Se forzó SQL_SERVER vacío para impedir conexiones Azure y se cerró el proceso de prueba.

git diff --check sin errores de whitespace. .env y backend/local.settings.json permanecen ignorados. No se crearon archivos con credenciales reales; .env.example contiene campos de credenciales vacíos. Las cadenas de contraseña de tests son fixtures sintéticos.

## Pendiente, explícitamente

El propietario eligió dejar pendiente la validación Azure. No se ejecutaron migraciones, no se creó administrador real y no se conectó a tallerj5. Por tanto **no se declara cerrada la validación funcional contra Azure SQL**.

La suite SQL preparada usa fixtures propios y ROLLBACK; comprueba autenticación, idempotencia, rowversion, cliente histórico y CHECK de kilometraje. Aún no se ejecutó. Tampoco están validados fallos ambiguos de COMMIT real, concurrencia entre procesos SQL, credenciales/Managed Identity/firewall, host Functions o dispositivos PWA.

El formulario de login se compiló; no se hizo un recorrido de navegador con credenciales reales. La UI completa de órdenes está fuera de alcance.

## Working tree y entrega

Rama existente usada: feature/backend-foundation. El árbol estaba limpio al comenzar. Todas las modificaciones sin commit corresponden a esta fase:

- Migraciones 001/002, adaptador SQL, contratos de dominio y hashing.
- Endpoints auth/admin/órdenes, configuración y adaptadores local/Functions.
- Scripts db:migrate, admin:create y test:sql.
- Login frontend, heartbeat y versiones opacas del autosave.
- Pruebas locales y suite SQL reversible.
- README, arquitectura, documentación SQL/infra y este registro.

Se retiró backend/src/store.ts, el almacén demo de producción. El único almacén simulado está en backend/test.

No hubo commit, push, merge ni despliegue. main y dev no fueron modificadas. Rama preparada para revisar y hacer commit/push; conservar esta advertencia de validación Azure pendiente al describir el cambio.

## Siguiente validación

Configurar .env localmente; revisar/aplicar pnpm db:migrate; ejecutar pnpm test:sql; crear el primer ADMIN con pnpm admin:create; iniciar pnpm dev y probar login, recarga, actividad, guardado y logout. No compartir la contraseña en chat ni argumentos de consola.
