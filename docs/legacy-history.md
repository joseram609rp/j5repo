# Historial anterior: importación y QA

Rama feature/legacy-history-import, actualizada con dev mediante ed98ee5. Incluye las migraciones 016 y 017. No hacer merge hacia dev/main hasta revisar la app.

## Ubicaciones y credenciales

El .env existente está en C:\j5repo\.env y no se borró. Git lo ignora; por eso no aparece automáticamente en la copia de trabajo separada. No copiarlo al repositorio ni mostrar sus valores. Node puede leerlo con --env-file=C:\j5repo\.env.

Copia de trabajo: C:\Users\joser\Documents\Codex\2026-11-08\referenced-chatgpt-conversation-this-is-an\work\j5repo
ZIP privado: C:\J5-legacy-private\J5_legacy_cleaned_PRIVATE.zip

## Destino aprobado

El usuario autorizó expresamente el 8 de noviembre de 2026 usar la base de producción existente j5sqlserver.database.windows.net / tallerj5, con tablas independientes. Esto reemplaza la instrucción anterior de cargar exclusivamente DEV/QA. La migración específica crea legacy y registra 017 en dbo.SchemaMigrations; no cambia datos ni definiciones de las tablas operativas. No ejecutar el migrador general, que podría aplicar otras migraciones pendientes.

El comando --migrate compara la historia SQL completa y sus checksums, exige las migraciones previas y aplica únicamente 017. Nunca modificar una migración ya aplicada ni su checksum. El importador requiere lista permitida explícita y --production-approved para ese servidor/base exactos; se rechaza ejecutar desde una instancia desplegada.

## Validación e importación (PowerShell)

Desde la copia de trabajo, con Node en PATH y el backend compilado:

```powershell
node --env-file=C:\j5repo\.env backend/dist/legacy-import.js C:\J5-legacy-private\J5_legacy_cleaned_PRIVATE.zip --validate
$env:LEGACY_ENVIRONMENT='production'
$env:LEGACY_ALLOWED_SERVER='j5sqlserver.database.windows.net'
$env:LEGACY_ALLOWED_DATABASE='tallerj5'
node --env-file=C:\j5repo\.env backend/dist/legacy-import.js C:\J5-legacy-private\J5_legacy_cleaned_PRIVATE.zip --migrate --production-approved
node --env-file=C:\j5repo\.env backend/dist/legacy-import.js C:\J5-legacy-private\J5_legacy_cleaned_PRIVATE.zip --apply --production-approved
```

Repetir --apply verifica conteos sin duplicar el mismo ZIP. Un archivo diferente con IDs ya existentes falla sin reemplazarlos. La transacción abarca toda la carga y usa bloqueo exclusivo; ante error se revierte completa. El ZIP no se extrae, limpia ni modifica. Se valida SHA-256 antes/después de leer. No subir ZIP, JSONL, reportes privados ni credenciales a Git.

Archivos usados: legacy_vehicles_curated.jsonl (13219), legacy_work_orders.jsonl (16289), legacy_mechanics.jsonl (5), quality_summary.json. Nulls, datos originales y marcas de calidad se conservan en payloads. ImportIssues conserva el resumen; cada registro conserva sus marcas individuales. Se preservan 3 fechas nulas, 13219 identificaciones nulas y los importes cero.

## Lectura histórica aislada

Tablas legacy.ImportBatches, Vehicles, WorkOrders, Mechanics e ImportIssues. No hay FK ni cargas hacia dbo.Customers, dbo.Vehicles u Orders.

El usuario interno j5_legacy_reader no tiene login y pertenece a legacy_reader: SELECT sobre legacy, DENY INSERT/UPDATE/DELETE/ALTER. El lector SQL de la API ejecuta EXECUTE AS USER para cada transacción histórica y luego REVERT; no utiliza esa identidad en consultas operativas. La cuenta actual de conexión es propietaria de la base; esta ejecución restringida limita las consultas históricas sin modificar los permisos operativos existentes. Si se cambia en el futuro a una identidad SQL no propietaria, conceder únicamente IMPERSONATE sobre j5_legacy_reader a la identidad real del API, tras revisión. No agregar la cuenta propietaria al rol legacy_reader: eso no restringiría al propietario y podría afectar la importación.

GET /api/legacy/work-orders?q=texto&from=2020-01-01&to=2026-12-31&page=1&pageSize=25
GET /api/legacy/work-orders/{record_id}

Todos requieren sesión válida; solo GET, respuestas no-store. La PWA no cachea API y esta pantalla no escribe IndexedDB. Se conservan fichas contradictorias por placa y se muestran separadas. Buscar por cliente encuentra trabajos de la placa compartida; no supone propiedad histórica cierta. Sin filtro de fecha se incluyen fechas nulas; un rango las excluye.

## Pruebas

```powershell
pnpm --filter @j5/backend build
pnpm --filter @j5/frontend typecheck
pnpm exec vitest run --maxWorkers=2
# Desde frontend:
pnpm exec vite build --configLoader runner
```

Verificaciones SQL exclusivamente de lectura, con conexión configurada:

```powershell
$env:LEGACY_LIVE_READ_TEST='1'
node --env-file=C:\j5repo\.env node_modules/vitest/vitest.mjs run backend/test/legacy-read.integration.test.ts --maxWorkers=1
```

No ejecutar suites generales de integración contra producción: pueden crear datos o probar mutaciones. La suite anterior solamente consulta conteos, permisos y el lector histórico.

QA de la app: configurar conexión local leyendo el .env original; iniciar API y frontend; entrar con cuenta existente; abrir Historial anterior; buscar placa/cliente/texto; probar fechas, paginación, detalle, fichas contradictorias, fecha nula, precio cero y falta de conexión. El historial no tiene controles de edición ni de reutilización en órdenes actuales. Las pruebas con dobles verifican creación/autosave/clientes/vehículos aislados sin crear registros de prueba en producción. Falta la revisión visual manual antes del merge/despliegue.

## Ejecución del 8 de noviembre de 2026

Conexión validada y migración 017 aplicada tras verificar 001–016. Carga completada y repetición idempotente confirmada sin duplicados. Pruebas SQL de solo lectura: 2 aprobadas; verificaron 1 lote, 13219 fichas, 16289 trabajos, 5 mecánicos, 3 fechas nulas, 13219 identificaciones nulas, 4125 precios cero, paginación/detalle y permisos efectivos de j5_legacy_reader (solo SELECT en legacy, sin SELECT en dbo.Orders). Conteos operativos antes/después: 6 clientes, 6 vehículos, 19 órdenes, 19 ítems, sin cambios. Suite local: 314 pruebas aprobadas y 39 integraciones operativas omitidas; no se ejecutaron mutaciones de prueba contra producción.

Para iniciar la API local con el .env que ya existe (sin copiarlo), desde esta copia de trabajo:

```powershell
node --env-file=C:\j5repo\.env backend/dist/local.js
```

En otra terminal, desde frontend, ejecutar `pnpm exec vite --host localhost --configLoader runner`. Abrir http://localhost:5173 e iniciar sesión con una cuenta existente. No ejecutar Nueva orden como prueba contra producción; verificar los flujos de escritura en un entorno de pruebas o con una operación real autorizada del taller. La app publicada no cambia hasta publicar/desplegar la rama; los datos SQL ya están cargados.
