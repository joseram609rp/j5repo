# Azure (preparado, sin despliegue)

Frontend: `frontend/dist`. Functions v4: `backend`, entrada compilada `dist/functions.js`, host.json; compilar antes del despliegue. Static Web Apps usa `/api` y Node 22, configurado en `frontend/public/staticwebapp.config.json` (Vite lo copia al build). Los paquetes del backend deben instalarse en el artefacto de despliegue; nunca publicar enlaces de node_modules del workspace. Al crear CI/CD fijar instalación con `pnpm install --frozen-lockfile`, `pnpm check` y empaquetar backend con sus dependencias de producción.

No se creó recurso ni workflow de despliegue. La API Azure solo habilita health; otras rutas devuelven 503 hasta implementar repositorios y autenticación persistente. No habilitar MemoryStore en Functions. `authLevel: anonymous` es el transporte HTTP para futuras cookies de aplicación, no permiso de acceso a datos.

Aplicar APP_ORIGIN a la URL HTTPS real, cookies Secure/HttpOnly/SameSite y CSRF. Variables sensibles solo en configuración de Azure/secret store. SQL con identidad administrada preferida; SQL_USER/SQL_PASSWORD son alternativas solo del backend. Configurar permisos mínimos y firewall cuando conectemos SQL.

Referencias verificadas al crear esta base:
- https://learn.microsoft.com/en-us/azure/static-web-apps/configuration
- https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview (45 s máximo por request)
- https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node
- https://learn.microsoft.com/en-us/azure/azure-sql/database/troubleshoot-common-connectivity-issues?view=azuresql
