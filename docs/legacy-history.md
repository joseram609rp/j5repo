# Archivo histórico (rama feature/legacy-history-import)

Rama creada desde dev (0c47e1d); no merges ni push. La copia de trabajo original C:\j5repo sigue en fix/legal-identification. Esta implementación está en la copia de trabajo indicada por `git worktree list`.

## Compatibilidad y privacidad

En dev la última migración es 015; 016 existe en fix/legal-identification. No se copió ni modificó. Se agrega 017, compatible con el ejecutor por nombre/checksum (no exige números consecutivos). Antes de cargar, el comando --migrate compara toda la historia efectiva y los checksums. Si SQL ya tiene 016 y esta rama aún no contiene ese archivo, aborta: integrar primero el cambio revisado de 016 en esta rama y repetir. Nunca alterar SchemaMigrations para saltarse esta comprobación.

El ZIP se lee sin extraer ni limpiar. Se usa exclusivamente legacy_vehicles_curated.jsonl, legacy_work_orders.jsonl, legacy_mechanics.jsonl y quality_summary.json. Los payloads conservan campos originales, procedencia, calidad y nulls. La tabla ImportIssues conserva el resumen de calidad; las marcas individuales permanecen en cada payload. Los IDs originales de registros son las claves; la secuencia antigua no se usa como clave. Fichas contradictorias de una misma placa se muestran separadas, sin asignar automáticamente propietarios ni relacionar dbo con legacy.

ZIP y JSONL están ignorados; mantenerlos fuera de Git. No imprimir payloads ni errores de driver. No copiar credenciales al repositorio. La API no devuelve raw_record ni el payload completo; usa Cache-Control: no-store. La PWA no cachea rutas API y esta pantalla no escribe en IndexedDB.

## Validación y carga exclusivamente DEV/QA

Requiere Node 22.12–24, PowerShell 7 (`pwsh`), dependencias del proyecto y SQL DEV/QA separado. Con pnpm disponible:

```powershell
pnpm --filter @j5/backend build
node backend/dist/legacy-import.js C:\J5-legacy-private\J5_legacy_cleaned_PRIVATE.zip --validate
```

Validación real del ZIP: 13219 vehículos, 16289 trabajos, 5 mecánicos, 3 fechas nulas y 13219 identificaciones nulas. Valida forma, IDs únicos, conteos y placas presentes; no corrige datos. Precios cero y fechas/cédulas nulas se conservan.

Configurar SQL_SERVER, SQL_DATABASE, SQL_AUTH_MODE y autenticación mediante variables del proceso con una identidad importadora separada. No usar el .env de producción. Confirmar con el responsable que la base es DEV/QA, luego definir:

```powershell
$env:LEGACY_ENVIRONMENT='dev' # o qa
$env:LEGACY_ALLOWED_SERVER=$env:SQL_SERVER
$env:LEGACY_ALLOWED_DATABASE=$env:SQL_DATABASE
node backend/dist/legacy-import.js C:\J5-legacy-private\J5_legacy_cleaned_PRIVATE.zip --migrate
node backend/dist/legacy-import.js C:\J5-legacy-private\J5_legacy_cleaned_PRIVATE.zip --apply
```

La lista permitida debe contener el servidor/base DEV/QA comprobados por el operador. No prueba por sí sola que una base no sea producción. El importador rechaza entornos de despliegue/producción, requiere coincidencia explícita y nunca usa credenciales inventadas. No ejecutar el migrador general para esta carga: su destino está fijado en el código existente a tallerj5. --migrate aplica solamente 017, tras validar las migraciones anteriores.

La carga usa bloqueo exclusivo y una transacción; falla completa ante colisiones o errores. Se verifica el SHA-256 del ZIP antes/después de leerlo. Repetir el mismo ZIP no duplica registros y verifica conteos. Un ZIP diferente con IDs ya existentes falla, sin reemplazar datos. La carga tiene presupuesto de 180 segundos; ante timeout revisar el resultado repitiendo el mismo archivo. No borrar tablas ni ejecutar limpiezas para reintentar.

Un DBA debe agregar la identidad API a legacy_reader con `ALTER ROLE legacy_reader ADD MEMBER [identidad_api]` usando el nombre real aprobado. Este rol tiene SELECT y DENY de INSERT/UPDATE/DELETE/ALTER sobre legacy. La API no debe ser db_owner, sysadmin, propietaria del esquema ni usar la identidad importadora: los propietarios pueden eludir los DENY. Verificar los permisos efectivos bajo la identidad API con HAS_PERMS_BY_NAME sobre legacy (SELECT=1; INSERT, UPDATE, DELETE, ALTER=0). No desplegar sin verificarlo. La migración no adivina ni cambia membresías de usuarios existentes.

## API y QA local

GET /api/legacy/work-orders?q=placa-o-cliente-o-texto&from=2020-01-01&to=2026-12-31&page=1&pageSize=25
GET /api/legacy/work-orders/{record_id}

Sesión activa requerida para todos los roles existentes. Páginas 1–10000, tamaño 1–100, fechas válidas, orden estable fecha/ID y total. Sin rango de fechas se incluyen fechas nulas; dentro de rango se excluyen. Sin filtros se pagina el archivo completo. Solo GET; intentos de escritura se rechazan. La consulta de cliente devuelve trabajos asociados por placa; el detalle lista todas las fichas candidatas y advierte sobre ambigüedad.

1. Ejecutar pnpm check (typecheck, pruebas, builds). Las pruebas SQL requieren una conexión DEV/QA autorizada; no confundir pruebas omitidas con aprobadas.
2. Validar ZIP, migrar, cargar y repetir --apply. Verificar 13219/16289/5 en tablas legacy y una sola fila de lote; revisar resumen de calidad y fechas/cédulas nulas. Capturar conteos dbo antes/después: deben permanecer iguales.
3. Con identidad API verificar SELECT y denegaciones. Con sesión expirada probar 401 y sin datos; con sesión válida buscar placa, cliente, texto, fechas y paginar. Probar vacíos, error de conexión, fecha nula, precio cero, fichas contradictorias y detalle inexistente.
4. Iniciar app/API con configuración DEV/QA y abrir Historial anterior. Confirmar funcionamiento en pantalla móvil y PWA instalada, sin cachear datos al perder conexión.
5. Crear una orden nueva, buscar clientes y vehículos, probar autosave, cerrar y consultar órdenes actuales. Ninguno debe tomar datos de legacy. Los tests de aislamiento comprueban rutas operativas y autosave; las tablas históricas no tienen FK operativa.
6. Revisar git diff/status, probar localmente y decidir el merge manualmente. Esta tarea no publica ni hace merge a dev/main.

## Verificación realizada y pendiente

Validación del ZIP real y pruebas automatizadas sin datos personales. No había conexión SQL configurada (servidor/base vacíos); no se aplicaron migraciones ni importaciones. Conteos SQL, permisos efectivos, integración SQL y recorrido visual conectado quedan pendientes de DEV/QA.

Resultados finales: 291 pruebas aprobadas, 39 SQL omitidas; suite completa con `vitest run --maxWorkers=2`. Typecheck frontend y compilación backend con `tsc`; frontend/PWA con `vite build --configLoader runner`. La primera corrida concurrente agotó tiempos de tests y la carga de configuración predeterminada de Vite encontró una restricción de acceso; ambas verificaciones pasaron con los comandos indicados. Se reutilizaron dependencias locales mediante enlaces de directorio ignorados, sin modificar dependencias ni lockfile.
