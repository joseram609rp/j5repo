# Integración del catálogo runtime

Resumen técnico vigente. Los conteos/estados operativos y relatos de ejecuciones QA anteriores fueron retirados; la procedencia de los datos se mantiene en sources.md/provenance.json.

## SQL y API

010_vehicle_catalog.sql crea VehicleMakes/VehicleModels con int IDENTITY, PK, active, created_at y nombres normalizados computed/persisted con trim y collation Latin1_General_100_CI_AI. Unicidad por marca normalizada y (make_id,normalized_name); FK VehicleModels -> VehicleMakes. Vehicles mantiene marca/modelo como texto libre, sin FK al catálogo.

Seed determinista de 57 marcas/986 modelos desde JSON y SHA-256. La migración es autocontenida, transaccional e inmutable con checksum; --check verifica reproducción sin escribir ni consultar CarsXE. No hay provenance en SQL; se conserva en los archivos de investigación.

GET /api/vehicle-catalog exige sesión, devuelve version=1 y entradas activas dinámicas, no-store y sin renovar actividad. El seed no fija el número de registros que puede devolver el runtime. No se hacen llamadas externas CarsXE.

## Frontend

IndexedDB j5-vehicle-catalog separado de borradores; cache schema 2 con fallback legacy schema 1, fetchedAt/payload y TTL siete días. Memoria compartida y fetch deduplicado. Cache stale sirve mientras refresca; red/storage no bloquean formulario. Retry máximo cuatro intentos, timeout 35 s y presupuesto 120 s, backoff 1/2/4 s+jitter y Retry-After para transitorios.

Autocomplete desde un carácter, hasta diez resultados, substring sin acentos/case y prioridad prefix, teclado y pointer. Modelos para marca exacta normalizada. Texto manual siempre permitido; seleccionar no modifica automáticamente el otro campo.

## Integridad y cleanup

Generador --check y validate-vehicle-catalog verifican JSON, referencias, aliases, provenance, duplicados y cobertura. Cleanup conserva catálogo completo y verifica snapshots bidireccionales/0 huérfanos, junto a ADMIN y SchemaMigrations 001–015. No ejecutar cleanup para validar integración.

La lectura de OrderItems conserva el orden del draft con valores SQL y soporte de duplicados/fallback legacy. Se evita reordenar trabajos por UUID aleatorio al guardar/reabrir. Pruebas unitarias y SQL cubren esa regresión.

[Contrato runtime](RUNTIME.md), [fuentes](sources.md) y [resultados actuales de verificación](../../docs/verification.md). Fixtures SQL hacen rollback, pero las secuencias pueden consumir números; no se registran conteos de negocio ni estados de la base en este reporte público.
