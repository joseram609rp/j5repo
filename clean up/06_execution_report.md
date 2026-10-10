# Ejecución QA — 2026-10-09
Branch feature/orders-mvp; HEAD inspeccionado 74e77d6dd6ec33df1a40e8a95a0a467385c4c19a.
Origen https://github.com/joseram609rp/j5repo.git. Estado inicial limpio.
Destino SQL tallerj5, verificado con .env local sin secretos en logs.
Servicios J5 detenidos por el usuario antes de ejecutar; listeners 5173/7071 ausentes.
Cleanup real confirmado por CLEANUP_COMMITTED. Checks de ADMIN campo por campo y SchemaMigrations dentro de transacción pasaron.

| Dato | Antes | Después |
|---|---:|---:|
| ADMIN | 1 | 1 |
| No ADMIN | 2 | 0 |
| Sessions | 10 | 0 |
| IdempotencyRequests | 186 | 0 |
| AuditLogs | 208 | 0 |
| OrderItems | 13 | 0 |
| Orders | 12 | 0 |
| Vehicles | 7 | 0 |
| Customers | 4 | 0 |
| SchemaMigrations | 9 | 9 |

Órdenes previas: CLOSED 7, VOID 5. OrderNumber: 622 antes, RESTART WITH 1 ejecutado.
Postcheck pasó; db:verify pasó con 1 ADMIN activo y triggers habilitados.
No se ejecutó test:sql ni se crearon fixtures SQL.
Cache del perfil Chrome/Edge QA pendiente manual: el navegador conectado solo expone Codex interno sin tabs del usuario.
Completar 04 antes de volver a hacer QA.
No merge, push ni cambios de migraciones aplicadas.

Verificación final: pnpm check pasó (194 tests locales; 16 SQL omitidos), typecheck y build completos. git diff --check pasó. .env ignorado/no tracked/no staged; revisión de secretos en archivos modificados pasó. .env.example conserva CARSXE_API_KEY vacío.

# Segunda ejecución QA — 2026-10-10

Autorizada por el usuario: ejecutar cleanup de nuevo para iniciar QA. Branch feature/orders-mvp, HEAD fb50e8e, cambios previos sin commit/staging. Runner normal con .env ignorado; destino tallerj5 verificado. Se identificaron y detuvieron API 7071 y frontend 5173 antes de borrar; ambos puertos quedaron sin listeners.

01_precheck PASS. 02_cleanup_qa con confirmación en memoria: CLEANUP_COMMITTED, order_number_reset=true. 03_postcheck PASS. db:verify PASS. Comparación transaccional campo por campo de ADMIN, catálogo y SchemaMigrations pasó.

| Dato | Antes | Después |
|---|---:|---:|
| ADMIN | 2 | 2 |
| No ADMIN | 1 | 0 |
| Sessions | 16 | 0 |
| IdempotencyRequests | 452 | 0 |
| AuditLogs | 475 | 0 |
| OrderItems | 13 | 0 |
| Orders | 31 | 0 |
| Vehicles | 4 | 0 |
| Customers | 9 | 0 |
| SchemaMigrations | 15 | 15 |
| VehicleMakes | 57 | 57 |
| VehicleModels | 986 | 986 |

Antes: CLOSED 9, OPEN 4, VOID 18. Secuencia OrderNumber 2482 -> reinicio en 1. Todos los triggers habilitados y constraints trusted; un ADMIN activo preservado. No test:sql posterior, no fixtures, CarsXE, commit, merge ni push.

Se inicia pnpm dev oculto para volver a QA. Limpieza del perfil Chrome/Edge pendiente manual: el conector solo expone los navegadores internos de Codex, sin pestañas del usuario. Completar 04_clear_local_cache.md en localhost:5173 antes de iniciar sesión, con las pestañas J5 anteriores cerradas. La reparación puntual anterior de ABC333 ya no aplica porque esos datos QA fueron eliminados con autorización.
Servicios reiniciados verificados: frontend localhost:5173 HTTP 200 y API /api/health status=ok/mode=sql. No se inició sesión ni se crearon datos QA.
