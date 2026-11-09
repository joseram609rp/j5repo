# Revisar borradores locales de J5

Antes de la ventana de mantenimiento, identificar todos los dispositivos, perfiles y orígenes J5, incluidas las instalaciones PWA. Revisar los borradores, la cola de sincronización y los conflictos en cada uno. Resolver los pendientes con su responsable y verificar que no queden cambios en tránsito. Cerrar las pestañas y aplicaciones tras la revisión y mantenerlas cerradas hasta que se verifique la limpieza SQL.

Si hay un dispositivo inaccesible o un borrador sin clasificar, detener la limpieza. El cierre de sesión no vacía IndexedDB. La limpieza SQL conserva las sesiones y no modifica el almacenamiento de ningún dispositivo.
