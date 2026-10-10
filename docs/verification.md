# Verificación — revisión del repositorio público

Fecha 2026-10-10 (America/Guatemala). Base origin/dev: 9f538d38bcdb44581cd722b35c5d93911e5e2bb4. Entorno de revisión: Node 24.20.0, pnpm 11.19.0. Los resultados siguientes corresponden a esta branch; reemplazan los relatos y conteos operativos de QA anteriores.

| Comando | Resultado |
| --- | --- |
| pnpm install --frozen-lockfile | PASS, exit 0, después del override shell-quote |
| pnpm check | PASS, exit 0: typecheck ambos workspaces; 21 archivos de pruebas aprobados, 2 omitidos; 279 pruebas aprobadas, 39 SQL omitidas por diseño; builds backend/frontend/PWA correctos |
| pnpm exec vitest run frontend/src/EntitySearch.test.tsx | PASS, exit 0, 3/3; posterior a anonimizar las fixtures |
| pnpm exec concurrently --version | PASS, exit 0; CLI de desarrollo funciona con shell-quote actualizado |
| pnpm test:sql | PASS, exit 0: 2/2 suites, 39/39 pruebas, 339.21 s; fixtures rollback-only |
| pnpm --filter @j5/backend db:verify | PASS en repetición secuencial, exit 0: 15 migraciones, constraints/indexes/triggers, lockout/username, catálogo 57/986 sin duplicados/huérfanos. Primer intento paralelo a SQL: exit 1 SQL_UNAVAILABLE; al repetir aislado pasó |
| node scripts/generate-vehicle-catalog-sql.mjs --check | PASS, exit 0; seed/migración reproducibles |
| node scripts/validate-vehicle-catalog.mjs | PASS, exit 0: 9 JSON, 57 marcas, 986 modelos, 302 adiciones respaldadas; aliases/provenance/coverage coherentes, sin API key |
| pnpm audit --json | Exit 1 por hallazgos: 2 critical, 3 moderate, 0 high/low/info |
| pnpm audit --prod --json | Hallazgos: 1 moderate, 0 critical/high/low/info; no es audit limpio |
| git diff --check | PASS, exit 0, después de corregir whitespace |
| Scan archivos versionados | Sin secretos confirmados; sin identificadores del caso retirado tras anonimización; env/local.settings ignorados y sin artifacts generados versionados |

No hubo timeout de bcrypt en las pruebas locales de esta ronda. Build emitió dos warnings de anotaciones PURE en Zod; Rollup elimina esos comentarios y completa build/PWA. No indican pérdida funcional probada ni alteración del bundle requerida.

La primera verificación SQL compitió con suites que retienen locks durante fixtures largas; su presupuesto se agotó. La repetición aislada completó en aproximadamente seis segundos, sin cambiar timeouts ni debilitar seguridad. La contención es la explicación compatible con los resultados, no un diagnóstico del tenant.

## Qué valida cada nivel

Unitarias: validación, auth/roles, ETag/idempotencia, cola/recovery, IVA, catálogo y SQL driver/retry. UI con happy-dom: navegación, selección, usuarios, formularios, mensajes y conflictos. Son pruebas automatizadas, no recorrido en un teléfono real.

`check` omite deliberadamente SQL. `test:sql` habilita J5_SQL_INTEGRATION y usa dos suites con repositorio scoped al mismo SqlUnit y runSql(..., undefined, true). El harness termina en rollback y no puede committear fixtures. Las secuencias SQL pueden consumir números aun con rollback; no se publica estado/conteo de datos de negocio.

`db:verify` revisa metadata, constraints/indexes/triggers y catálogo. El runner migrate es quien valida checksums aplicados; no se corrió db:migrate porque no cambió ninguna migración. 001–015 permanecen idénticas a la base; solo se eliminó el placeholder .gitkeep de carpeta poblada.

## Alcance y pendientes

No cleanup destructivo, CarsXE calls, cambios de DB schema, deployment, merge ni history rewrite. Pendientes: móvil/tablet real, PWA instalada, host Functions/headers/cookies/cold start del dominio Azure, commits ambiguos y carga entre procesos.

[Revisión de seguridad](security-review.md) detalla advisories pendientes y la limitación Managed Identity de Managed Functions/SWA Free. Los logs completos permanecen locales fuera del repo; esta documentación contiene resultados técnicos, sin PII, credenciales ni conteos operativos.
