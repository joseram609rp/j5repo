# Catálogo local de sugerencias de vehículos — Costa Rica

Fecha de investigación: 2026-10-09 (America/Guatemala). Las consultas API llevan timestamp UTC.

El catálogo contiene únicamente marca y modelo base. Es una ayuda de escritura, **no una whitelist**: Vehicles.make/model deben seguir aceptando texto libre. Esta ronda no incorpora el catálogo a la aplicación, SQL, migraciones ni autocomplete.

## Archivos y flujo

- `makes.json`: marcas canónicas y nombres de consulta CarsXE.
- `carsxe_raw.json`: respuestas API, sin normalizar sus arrays; cada intento conserva marca, nombre consultado, UTC, endpoint sin key, parámetros, estado HTTP, success y warnings. `response` conserva la respuesta JSON con campos secretos suprimidos. `requests` es un historial agrupable por make; `runs` registra cada ejecución.
- `evidence.json`: fuentes identificadas y modelos base observados en CR, incluidos modelos que ya existían en el seed.
- `market_observations.json`: etiquetas y enlaces de anuncios CRAutos, filtros POST y páginas revisadas. Años en las etiquetas son evidencia, nunca campos del catálogo final. No se guardan descripción, precio ni datos del anunciante.
- `aliases.json`: equivalencias explícitas de marca y reducción editorial a modelo base. Las familias corporativas no se fusionan.
- `manual_additions.json`: modelos ausentes del seed normalizado, con source_ids, URLs y motivo. Las adiciones respaldadas por usados también conservan enlaces individuales.
- `vehicle_catalog_final.json`: salida limpia, alfabética, `brands[].make` + `brands[].models[]`.
- `provenance.json`: para cada modelo final, nombres RAW originales y fuentes locales.
- `coverage.json` / `coverage.md`: conteos por marca, llamadas y saldo estimado.
- `sources.md`: metodología y evidencia por marca; `REVIEW.md`: decisiones y ambigüedades visibles para revisión humana.

RAW + manual additions + aliases → final/provenance/coverage. El regenerador NO consulta internet ni cambia RAW/manual. Para modificar sugerencias, editar manual_additions/aliases y regenerar. Para ampliar la investigación, mantener evidence.json y sources.md coherentes con las adiciones nuevas.

## Actualizar sin consumir cuota

Desde la raíz del repositorio, con Node 22.12 o superior:

```powershell
node scripts/build-vehicle-catalog.mjs
node scripts/validate-vehicle-catalog.mjs
```

El resultado es determinista para los mismos insumos; incluye SHA-256 del RAW. El validador comprueba JSON, esquemas básicos, referencias, duplicados, marcas/modelos vacíos, cobertura y correspondencia entre insumos y final. No requiere dependencias ni afecta el typecheck de los workspaces.

## Consultar CarsXE cuidadosamente

```powershell
node scripts/fetch-vehicle-catalog.mjs --list
node scripts/fetch-vehicle-catalog.mjs --makes=Toyota,Suzuki --dry-run
node scripts/fetch-vehicle-catalog.mjs --makes=Toyota,Suzuki --max-requests=2
```

Por defecto omite marcas que ya tienen respuesta exitosa no vacía. Las marcas con lista vacía **sí consumirán otra llamada si se seleccionan nuevamente**: usar subsets explícitos, no repetir la ejecución completa después de esta ronda. `--refresh` fuerza una nueva consulta y conserva el historial; no usar salvo actualización deliberada.

Un alias requiere una sola marca, por ejemplo `--makes=KGM --query-make=KGM --max-requests=1`. Solo usarlo si hay justificación: los tres aliases probados en esta ronda devolvieron cero modelos.

Se exige `--max-requests=1..60`; además se rechaza un presupuesto que supere el límite lifetime conservador de 100 según historial + 2 requests anteriores estimados. El historial se escribe **antes** de cada llamada; una interrupción/falla cuenta conservadoramente y no se reintenta automáticamente. HTTP 401/403/429, límite alcanzado, usage.remaining=0 o error de red detienen el fetch. Endpoint único `/v1/ymm-options`, dimension=models y make, sin años/model/trims/variants. Si existe usage se guarda, sin hacer consultas adicionales para adivinar cuota.

La clave se lee de CARSXE_API_KEY en entorno o `.env`, solo en memoria. Nunca escribirla en catálogo, enlaces, logs, ejemplos, tests o commits. `.env` sigue ignored y no tracked; `.env.example` conserva el campo vacío. Se censuran secretos del JSON de respuesta y no se imprimen URLs autenticadas ni errores de fetch que podrían incluir la URL.

## Cuota de esta ronda

**60 requests exactos**, todos HTTP 200 y success=true: 57 marcas y 3 segundos intentos de alias. 23 marcas entregaron modelos; 34 entregaron lista vacía. Los dos requests previos (Toyota/Suzuki) no tenían RAW persistido, por eso se consultaron otra vez dentro de los 60.

Total acumulado estimado: **62**. Saldo lifetime estimado: **38**. Ninguna respuesta de esta ronda expuso usage; el saldo no está verificado por el proveedor. No hubo calls de makes, años, variantes, trims ni usage independientes.

Consultas iniciales con nombre distinto al canónico: Citroën → Citroen; KGM → SsangYong. Segundos intentos: Great Wall → GWM, KGM → KGM, MG → M.G.; todos vacíos. No más intentos necesarios en esta ronda.

## Criterios

Se preservan modelos CarsXE poco comunes; no se descartan por rareza en CR. Se agrupan repeticiones por case/espacios/puntuación y motorización, acabado o carrocería del mismo modelo mediante aliases explícitos. Nombres comerciales/familias diferenciadas se conservan cuando la equivalencia no es segura; revisar REVIEW.md. La normalización no incluye años, motores ni trims como atributos.

Para CR se priorizan automóviles, SUVs, pickups y utilitarios/vanes livianos de taller; las páginas comerciales sirvieron para presencia, pero no se añadieron manualmente camiones medianos/pesados, buses ni maquinaria. La cobertura es una base amplia revisable, no inventario exhaustivo ni afirmación de disponibilidad actual de todos los modelos.

La procedencia CarsXE queda identificada; la ambigüedad de términos no se utilizó como blocker de este seed local autorizado. Los datos están preparados para revisión y commit manual: sin commit, merge ni push automático. El documento histórico `clean up/05_carsxe_validation.md` queda intacto; su propuesta de pausa previa queda superada para esta ronda por las instrucciones del usuario.
