# Edición simultánea de borradores

## Revisión del diseño

- El aviso observado es compatible con una solicitud de exclusión sin concesión. La inspección del ciclo de vida mostró que ocultar la página no liberaba la concesión. Esto no identifica quién la retenía en la tablet del cliente.
- Primera revisión: retirar la exclusión sin cambiar IndexedDB dejaría una carrera entre dos lecturas seguidas por escrituras independientes. El ETag y el recibo de idempotencia operan en el servidor. Una transacción local compara la revisión de almacenamiento y publica el borrador o guarda una copia recuperable.
- Segunda revisión: el contador de edición se repite al reconstruir un registro y no identifica un snapshot persistido. Usamos una revisión separada para todo cambio canónico, incluidos payload pendiente, recepción, cancelación, resolución y metadatos. La copia de recuperación se agrega en la misma transacción sin invalidar al editor que sigue trabajando sobre la versión vigente.
- El payload remoto se envía tras confirmar su persistencia. Si otra pestaña avanza mientras llega la respuesta, el recibo no reemplaza su borrador. Un pendiente persistido se reintenta con la misma clave y contenido. Una copia de recuperación nunca ejecuta su acción pendiente.
- Recuperar vuelve a leer IndexedDB. Un resultado tardío de sesión, orden o red no debe reconstruir una copia antigua sobre datos vigentes. El cambio de versión de IndexedDB impide escrituras de la aplicación anterior, que desconocía la revisión. Recargar todas las pestañas actualiza los editores antiguos.
- La recuperación se descarga desde el editor o desde Órdenes abiertas, incluso para una orden cerrada o un borrador cancelado. El usuario puede consultar la copia y volver a introducir los datos que decida conservar sobre la orden vigente. Una pestaña que perdió la comparación deja de enviar cambios de esa orden.
- El ciclo de vida no concede permisos. Al ocultar la página se suspenden envíos nuevos y se dejan terminar escrituras locales ya encoladas. Volver a la página permite sincronizar. El cierre de sesión y la expiración conservan sus controles independientes.

## QA pendiente en iPad

Usar datos ficticios. Crear una orden del día y una anterior. Editar, cambiar de app, volver, recargar y recuperar desde Órdenes abiertas. En dos pestañas, guardar cambios distintos en el mismo borrador, comprobar ambas copias, volver a la versión vigente y crear otra orden. Repetir con la red interrumpida y comprobar la reconexión. Verificar también que cerrar sesión y volver a entrar recupera el borrador.

El almacenamiento local depende de la cuota, la persistencia y el origen del navegador. Un fallo de escritura permite descargar el borrador desde el editor mientras siga abierto. La versión nueva de IndexedDB conserva los registros existentes; una aplicación anterior que intenta abrir la versión 1 debe actualizarse para volver a acceder a ellos.
