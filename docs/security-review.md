# Security / code hygiene review — 2026-10-10

Alcance: tree de origin/dev base 9f538d38bcdb44581cd722b35c5d93911e5e2bb4, branch chore/repo-hardening-docs, código vigente, documentación, scripts, tests, archivos tracked y auditoría del lockfile. Revisión estática y pruebas existentes; no es pentest ni revisión del tenant Azure. No hubo cleanup real, CarsXE calls, deployment, merge ni history rewrite.

## Hallazgos y tratamiento

| Nivel | Hallazgo | Tratamiento / estado |
| --- | --- | --- |
| Critical (audit, desarrollo) | Dos advisories de Tinypool 1.1.1, gadget de prototype pollution a RCE | Pendiente: versiones corregidas 2.1.1/2.1.2 implican major de la dependencia del runner. No forzar override a Vitest 3; evaluar upgrade coordinado. No empaquetar tooling de pruebas en Azure |
| Critical (audit, desarrollo), corregido | shell-quote 1.9.0: command injection con entradas especiales a quote | Override acotado a 1.11.0, mismo major; instalación reproducible y pruebas/build revisados. Retirar override cuando concurrently resuelva una versión segura sin él |
| High (privacidad) | Reparación y relatos QA públicos con datos identificables; fixture UI reutilizaba datos del caso | Reparación SQL y reporte de ejecución eliminados; documentos reescritos sin PII; prueba utiliza datos sintéticos. Copias históricas siguen accesibles en commits previos |
| Medium (audit, desarrollo) | Vitest 3.2.7 y @vitest/mocker: path traversal/file read por redirect mock | Pendiente; audit indica corrección >=4.1.11, major no autorizado. No exponer servidor de test ni procesar tests no confiables |
| Medium (audit, runtime) | sprintf-js 1.1.3 vía mssql/tedious: DoS si atacante controla format string/precision | Pendiente. Registry no ofrece 1.1.4 en esta revisión, aunque audit la anuncia; GitHub advisory marca sin versión corregida. No se encontró ruta de la API que entregue formato arbitrario del usuario a sprintf; esto no equivale a probar inexplotabilidad |
| Medium (operacional) | Límites globales de login por proceso; identidad/permisos SQL de producción y retención aún no validados | SQL lockout persiste entre instancias; añadir control distribuido si se escala. Validar grants/Managed Identity y política de sesiones/receipts/auditoría antes de producción |
| Medium (arquitectura prevista) | Managed Functions en SWA Free no admite Managed Identity para API | Documentado en infra: SQL restringido en settings para Free, o cambio de host/plan para identidad; bring-your-own integrado requiere Standard. No se modificó el alojamiento |
| Low (operacional) | Borradores/contacto en IndexedDB persisten en el dispositivo incluso después de logout | Documentado: perfiles/dispositivos confiables, copias de recuperación y limpieza local explícita; separar por userId no cifra ni protege de acceso al perfil |
| Info | README y reportes describían reglas/schema antiguos; .gitkeep ya innecesario | Actualizados 15 migraciones, owner flow, placas, catálogo y setup; placeholder de carpeta retirada |

No se identificó otro fallo concreto pequeño de autorización/integridad que justificara cambiar runtime en esta revisión. Los findings de dependencias permanecen explícitos; no se aplicó audit fix --force ni upgrade major.

## Dependencias

Audit inicial: 3 critical, 3 moderate, 0 high/low/info. Tras shell-quote: **2 critical, 3 moderate**, 0 high/low/info. Son entradas de advisories, no cinco paquetes independientes: Tinypool tiene dos avisos; Vitest/mocker comparten otro. `pnpm audit --prod`: **1 moderate**, 0 critical/high/low/info (sprintf-js). Audit completo termina con código no cero por hallazgos pendientes; no es un resultado limpio.

Fuentes de advisories:

- [Tinypool worker options](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)
- [Tinypool run options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)
- [shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)
- [Vitest/mocker](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
- [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)

## Controles comprobados en código

- password.ts/domain.ts: bcrypt 12, min 12 caracteres/max 72 bytes UTF-8 y dummy compare; no truncamiento silencioso.
- api.ts/sql.ts/012: cinco fallos, 15 minutos, counters/lockout SQL, receipts contra doble incremento por reintento ambiguo; límites local/global adicionales.
- Token aleatorio opaco, SQL hash; cookie HttpOnly/Strict/Secure producción, CSRF timingSafeEqual y Origin exacto.
- Dos horas sin GET/autosave renewal; reset/desactivación/cambio de rol revocan sesiones y roles se releen.
- Parámetros SQL para valores; identificadores dinámicos del chequeo FK provienen de metadata y se citan escapando corchetes.
- ADMIN/MECHANIC, último ADMIN, inactivo/sin referencias para safe-delete; idempotencia/ETag, savepoints y guards CLOSED/VOID.
- Transferencia de dueño ligada a identidad exacta; close-time resolution revisa dueño esperado en la transacción y conserva snapshots.
- CSP/headers en SWA y service worker sin cache API; revisar aplicación efectiva en Azure y dispositivos.
- Cleanup exige confirmación, destino/schema conocidos, transacción/locks y snapshots íntegros de ADMIN, migraciones y catálogo. No se ejecutó.

## Scan y privacidad

Scan de archivos versionados por env/key/local.settings, formatos de tokens/private keys/connection strings, coincidencias con secretos locales mantenidas en memoria, artifacts generados y patrones de identidad documental. No se encontraron secretos confirmados ni CarsXE key committed; cinco coincidencias amplias de password fueron variables/código, no valores filtrados. .env/local.settings están ignorados; .env.example deja todos los valores vacíos. Se agregaron ignores para claves/certificados y exports de DB.

No hay node_modules/dist/coverage/dumps/screenshots versionados; logos/assets válidos permanecen. Logs existentes son mensajes operativos de CLI/local y metadata de verificación; runtime no imprime passwords/tokens ni errores driver. No se encontraron TODO/FIXME/HACK reales en código tracked; menciones de TODOS en texto español no son tareas técnicas.

Documentos actuales no contienen los UUID/cédulas específicos de los casos retirados. Coincidencias en pruebas del caso fueron sustituidas; otras identidades de tests son fixtures sintéticas o generadas. Fuentes/provenance del catálogo se conservan por valor técnico, con URLs públicas de investigación y sin anunciante/contacto/clave.

Historia: los commits previos que agregaron esos artifacts siguen accesibles en branches/commits remotos. Este cambio elimina/redacta únicamente HEAD de la branch; dev/main aún no cambian hasta un merge autorizado. No se hizo rewrite ni force-push. Si los datos eran reales, evaluar tratamiento del historial por separado con autorización explícita; una filtración de credenciales requiere rotación independientemente de Git.

[Resultados de pruebas y límites](verification.md). Deployment DEV, móvil/tablet, COMMIT ambiguo y carga entre procesos siguen pendientes.
