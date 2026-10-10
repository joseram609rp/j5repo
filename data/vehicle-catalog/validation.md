# Validación de la ronda — 2026-10-09

- Repositorio: C:\j5repo; branch feature/orders-mvp; HEAD 1148df6457dfd86842c956960fc144b1db5a0a3d, sin cambios de branch/HEAD.
- Catálogo final: 57 marcas, 986 modelos base, 302 adiciones manuales con fuente. JSON parseables; nombres no vacíos; duplicados normalizados ausentes; orden alfabético; aliases, cobertura y procedencia consistentes.
- CarsXE: 60 requests exactos; todos HTTP 200/success=true. 23 marcas con modelos y 34 listas vacías. Historial previo estimado 2, total 62, saldo estimado 38; usage no expuesto.
- Regeneración offline ejecutada dos veces: hashes idénticos en final/provenance/coverage JSON y reporte Markdown.
- Sintaxis de los tres scripts comprobada. List mode devuelve 57 marcas; dry-run por Toyota/Suzuki no consulta API.
- Guardrails comprobados: presupuesto 61 rechazado por límite de ejecución; presupuesto 39 rechazado por límite lifetime. RAW idéntico antes/después: cero requests adicionales en estas pruebas.
- git diff --check: PASS. Comprobación adicional de whitespace/final newline en TODOS los archivos nuevos (incluidos untracked): PASS.
- Clave CarsXE buscada solo en memoria: ausente en archivos del catálogo/scripts. .env ignored, no tracked ni staged; .env.example mantiene CARSXE_API_KEY vacío.
- Sin archivos tracked modificados y sin archivos staged. Solo se agregaron data/vehicle-catalog/ y tres scripts .mjs; no se ejecutó pnpm check porque no cambió código de aplicación/TS.
- Sin SQL, migraciones, frontend, QA cleanup, commit, merge o push.

Limitaciones de evidencia y nombres para revisión: REVIEW.md. Cobertura por marca: coverage.md. Evidencia individual: sources.md y provenance.json.
