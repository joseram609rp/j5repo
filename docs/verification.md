# Verificación de la base — 2026-10-03

Entorno inspeccionado: repo limpio, README inicial únicamente, remoto correcto. Node 24.19.0 disponible en runtime local; pnpm 11.19.0 utilizado sin instalación global. Dependencias instaladas localmente y fijadas por pnpm-lock.yaml. Git se inspeccionó con safe.directory limitado a cada comando (sin modificar configuración global).

`pnpm check`: comprobación estricta de tipos, 14 pruebas aprobadas y compilaciones backend + frontend/PWA correctas.

Pruebas: producción falla cerrada; replay tras commit sin duplicar; misma clave/otro payload = 409; versión vieja = 412; falta versión = 428; sesiones vencen en el límite; lectura no renueva; actividad renueva; CSRF y logout; validación de datos; clasificación de SQL transitorio; presupuesto SQL agotado; operación colgada; cola persistida tras respuesta perdida/reinicio; conflicto conserva cambios; fallo local impide envío; pausa espera escritura en vuelo; cliente no reintenta mutaciones inseguras/conflictos y respeta Retry-After.

Navegador: acceso demo, captura de datos ficticios, confirmación de guardado en servidor, recuperación después de recargar, cierre/reingreso conservando datos. Revisión visual de escritorio y viewport móvil de 390 px.

No validado aún: conexión Azure SQL real, migraciones, autenticación real, ejecución en host Azure Functions, despliegue, instalación PWA en dispositivos físicos, recuperación offline del service worker en producción. Estas pruebas requieren las siguientes etapas, no secretos para ejecutar la base actual.
