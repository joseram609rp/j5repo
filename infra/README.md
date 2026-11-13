# Despliegue en Azure

GitHub Actions compila y despliega J5 en Azure Static Web Apps mediante [Azure Static Web Apps CI/CD](../.github/workflows/azure-static-web-apps-nice-pond-067481c10.yml). Un push a `dev` despliega el entorno de pruebas y un push a `prod` despliega producción. Un PR hacia `prod` genera un entorno temporal que se cierra al cerrar el PR.

El workflow instala dependencias con el lockfile del workspace, compila `frontend/dist` y publica la API de `backend` como Managed Azure Functions v4 con Node 22. El navegador consume `/api` en el mismo origen. El archivo `frontend/public/staticwebapp.config.json` selecciona el runtime y los encabezados de seguridad.

## Configuración

Configurar `APP_ORIGIN` para el origen HTTPS autorizado y mantener `SQL_*` exclusivamente en la configuración de la API. En Managed Functions con SWA Free, usar credenciales SQL restringidas para el runtime. Separar los permisos de ejecución de los permisos DDL para migraciones. El despliegue del código no aplica migraciones SQL.

El transporte de Functions usa `authLevel=anonymous`. La API aplica sesión, CSRF y roles. `GET /api/health` es público y devuelve el estado del servicio.

## Verificación y promoción

1. Ejecutar `pnpm check` y abrir el PR hacia `dev`.
2. Tras el merge, comprobar el resultado de **Build and Deploy** para el commit de `dev` en GitHub Actions. Abrir la URL del despliegue, verificar que carga la aplicación y comprobar `GET /api/health`.
3. Probar en DEV el acceso, la vista previa de ambas modalidades, la edición en otra pestaña y la recuperación de conexión. Usar datos de prueba en un destino SQL autorizado para QA.
4. Abrir el PR de `dev` a `prod` y revisar su despliegue temporal. Tras el merge, comprobar **Build and Deploy** para el commit de `prod` y repetir las comprobaciones de carga y salud en producción.

[Arquitectura](../docs/architecture.md) · [Seguridad](../docs/security-review.md)
