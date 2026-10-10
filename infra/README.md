# Azure: preparado, sin despliegue

Frontend: frontend/dist. Functions v4: backend, entrada compilada dist/functions.js, host.json. Static Web Apps usa /api y Node 22. Compilar antes del eventual despliegue y empaquetar las dependencias productivas sin enlaces del workspace.

No se creó recurso ni workflow de despliegue. Local y Functions usan el mismo backend SQL; sin configuración falla cerrado. authLevel: anonymous es el transporte para cookies de aplicación; la API exige su sesión, CSRF y roles.

Antes de desplegar: validar migraciones y permisos contra tallerj5, probar el host Functions, configurar APP_ORIGIN con HTTPS exacto, NODE_ENV=production, identidad Entra/Managed Identity preferida y un limitador compartido de login. Las variables sensibles deben residir exclusivamente en application settings/secret store. SQL_USER/SQL_PASSWORD solo pertenecen al backend. No se habilitó ningún despliegue en esta fase.

Las pruebas de instalación PWA en dispositivos, gateway, cold start real y cookies en el dominio final siguen pendientes.
