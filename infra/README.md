# Azure: preparación de DEV y producción

Arquitectura prevista: Azure Static Web Apps Free para frontend/PWA y Managed Azure Functions v4 Node 22 para /api, con Azure SQL Free/serverless. No existe workflow ni evidencia versionada de despliegue DEV; la revisión del repo no comprueba recursos del tenant Azure.

## Deployment DEV

1. Validar código/SQL con los comandos del README y migraciones 001–015. Separar identidad DDL de runtime.
2. Compilar frontend/dist y backend/dist/functions.js; probar host Functions con backend/host.json. Empaquetar dependencias productivas sin enlaces pnpm al workspace; nunca incluir .env/local.settings ni tooling de pruebas.
3. Configurar SWA con frontend y API backend, /api del mismo origen y frontend/public/staticwebapp.config.json. El archivo selecciona apiRuntime node:22 y headers CSP/nosniff/referrer-policy.
4. Configurar APP_ORIGIN al origen HTTPS exacto y NODE_ENV=production; SQL_* solo en settings del backend. Para Managed Functions en SWA Free, usar credenciales SQL de permisos mínimos en application settings; Managed Identity para la API no está disponible en este modo. SQL_AUTH_MODE=default requiere un host con identidad habilitada. Configurar firewall y verificar conexión real.
5. Probar login, cookie Secure/HttpOnly/SameSite, CSRF/Origin, CSP, auth/roles, PWA, offline/conflictos y cold start SQL desde el dominio final.
6. Probar teléfono y tablet reales: teclado, rotación, scroll, botones, instalación/actualización PWA y recuperación tras pérdida de conexión.

Functions registra transporte authLevel=anonymous; la API aplica sesión, CSRF y roles. No equivale a acceso anónimo a datos. Health es público y devuelve únicamente estado/modo.

## Paso a producción

main expresa intención estable; dev integra trabajo mediante PR y QA DEV. Antes de promoción: decidir alojamiento/identidad y validar permisos mínimos, límites compartidos si hay múltiples instancias, respaldo/restauración y política de retención compatibles con cola offline. No publicar secretos en VITE_* ni en artifacts. Audit tiene pendientes de tooling/dependencias detallados en [security-review](../docs/security-review.md); evaluar antes de exponer entornos de desarrollo.

No se crearon recursos, workflows, reglas de branches ni despliegues durante esta revisión. [Arquitectura](../docs/architecture.md) y [resultados](../docs/verification.md).

## Límite de identidad del plan

Managed Azure Functions de SWA no admiten Managed Identity ni referencias Key Vault para la API. Bring-your-own Functions sí lo permite, pero su integración con SWA requiere Standard. Antes de producción decidir entre seguir en Free con credencial SQL restringida/rotada o cambiar alojamiento para identidad administrada. No se cambió ni contrató un plan. Fuentes oficiales: [comparación de API](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions), [FAQ de identidad](https://learn.microsoft.com/en-us/azure/static-web-apps/faq) y [bring-your-own Functions](https://learn.microsoft.com/en-us/azure/static-web-apps/functions-bring-your-own).
