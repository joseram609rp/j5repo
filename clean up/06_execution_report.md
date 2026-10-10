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
