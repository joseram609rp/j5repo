# Edición simultánea de borradores

## Revisión del diseño

- El aviso observado es compatible con una solicitud de exclusión sin concesión. La inspección del ciclo de vida mostró que ocultar la página no liberaba la concesión. Esto no identifica quién la retenía en la tablet del cliente.
- Primera revisión: retirar la exclusión sin cambiar IndexedDB dejaría una carrera entre dos lecturas seguidas por escrituras independientes. El ETag y el recibo de idempotencia operan en el servidor. Una transacción local compara la revisión de almacenamiento y publica el borrador o guarda una copia recuperable.
- Segunda revisión: el contador de edición se repite al reconstruir un registro y no identifica un snapshot persistido. Usamos una revisión separada para todo cambio canónico, incluidos payload pendiente, recepción, cancelación, resolución y metadatos. La copia de recuperación se agrega en la misma transacción sin invalidar al editor que sigue trabajando sobre la versión vigente.
- El payload remoto se envía tras confirmar su persistencia. Si otra pestaña avanza mientras llega la respuesta, el recibo no reemplaza su borrador. Un pendiente persistido se reintenta con la misma clave y contenido. Una copia de recuperación nunca ejecuta su acción pendiente.
- Recuperar vuelve a leer IndexedDB. Un resultado tardío de sesión, orden o red no debe reconstruir una copia antigua sobre datos vigentes. El cambio de versión de IndexedDB impide escrituras de la aplicación anterior, que desconocía la revisión. Recargar todas las pestañas actualiza los editores antiguos.
- Una pestaña sin cambios propios pendientes lee el borrador vigente de IndexedDB al recibir una señal de guardado o al volver al primer plano. La señal de almacenamiento no contiene datos de clientes. Seguir el borrador de otra pestaña no vuelve a enviar su solicitud.
- Si dos pestañas editan simultáneamente, la transacción conserva una copia recuperable de la edición desplazada y deja de enviarla. La descarga está en el editor o el detalle de la orden correspondiente en Historial. El listado de órdenes abiertas incluye órdenes OPEN y borradores pendientes del dispositivo.
- El ciclo de vida no concede permisos. Al ocultar la página se suspenden envíos nuevos y se dejan terminar escrituras locales ya encoladas. Volver a la página permite sincronizar. El cierre de sesión y la expiración conservan sus controles independientes.

## QA pendiente en iPad

En un entorno de QA, usar placa JJJ111, cliente test, cédula 333333333, teléfono 33333333, Toyota Land Cruiser Prado, año 2023. Abrir la misma orden en dos pestañas y editar una observación. La segunda pestaña debe mostrar el cambio sin confirmación. Editar observaciones distintas al mismo tiempo sin conexión, comprobar la descarga de la copia desplazada, recargar y volver a conectar. Cerrar la orden, buscar JJJ111 en Historial, abrir el detalle y comprobar que el respaldo sigue disponible. Pasar por Inicio, Usuarios y Órdenes abiertas y comprobar que los avisos de esa orden no se muestran.

Si IndexedDB espera una conexión de una versión antigua, guardar los cambios en esa pestaña, cerrarla y reintentar. Aplicar la actualización de la aplicación después de sincronizar el editor y recargar las demás pestañas después de guardar en ellas. La migración conserva los registros y los recibos pendientes. Un fallo de escritura permite descargar el borrador desde el editor mientras siga abierto.
