# Catálogo runtime
Regenerar: node scripts/generate-vehicle-catalog-sql.mjs. Verificar reproducción: agregar --check. La migración 010 es autocontenida y el runner la aplica en transacción con checksum; no editar tras aplicación.
Los nombres normalizados son computed/persisted con trim y collation Latin1_General_100_CI_AI; el índice único de modelos cubre make_id y normalized_name. Vehicles conserva texto libre sin FK al catálogo.
GET /api/vehicle-catalog autenticado no renueva idle session. Cache IndexedDB j5-vehicle-catalog separado de drafts, schema 1, TTL 7 días, memoria compartida y fetch deduplicado. Cache stale se usa mientras refresca; fallo o almacenamiento no disponible nunca bloquean órdenes.
La carga usa api() con 4 intentos máximo, timeout por intento 6 s, backoff 1/2/4 s con jitter y Retry-After, deadline global 30 s. Solo transitorios; mutaciones conservan su estrategia original. SQL conserva retrySql.
Autocomplete desde un carácter, hasta 10 sugerencias, match por substring sin acentos/case, prioriza prefix. Modelos solo para marca exacta normalizada. Teclado, pointer y texto custom; elegir nunca modifica automáticamente el otro campo.
Cleanup preserva ambas tablas y verifica snapshots completos, 57/986 y cero huérfanos.
