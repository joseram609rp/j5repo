# Contratos y garantías de esta base

## Qué funciona hoy
React/TypeScript/Vite responsive y PWA con shell offline de producción; API de desarrollo local; cookie HttpOnly/SameSite; CSRF + Origin; expiración deslizante de 2 horas validada por servidor y navegador; borrador en IndexedDB por usuario; autosave a los 800 ms; recuperación al entrar; reintento al recuperar conexión; idempotencia y comparación de versión en repositorio de memoria. La cookie HTTP sin Secure es exclusivamente del servidor de loopback de demostración. Las sesiones no tienen credenciales reales todavía.

La demostración permite UN borrador por usuario, bloqueado por Web Locks para evitar dos editores locales sobre la misma cola. No representa todavía las pantallas finales ni el esquema de negocio. Un conflicto conserva el borrador, detiene sincronización y requiere revisión: la UI de comparación/resolución es siguiente etapa. El kilometraje faltante puede persistir como borrador; el cierre futuro lo requerirá.

## Guardado
IndexedDB se escribe en cada edición; llamadas al servidor serializadas. Cada envío congela payload, idempotency key, revisión local y ETag ANTES de enviarse. Si la respuesta se pierde, reiniciar o reconectar repite exactamente esa operación. Ediciones nuevas viajan después con otra clave y la versión confirmada. Nunca borrar una edición nueva al confirmar una vieja. Un fallo de IndexedDB se muestra y no se envía una mutación sin guardar antes su comprobante local. Como cualquier navegador, no se garantiza una escritura interrumpida por apagado repentino o limpieza de datos del sitio.

SQL será la fuente oficial cuando exista adaptador. Hoy el servidor de demo pierde datos al reiniciar: los borradores locales permanecen, pero un ETag anterior puede producir 412. Esto es intencional; revisar y exportar el borrador antes de limpiar almacenamiento de prueba. No usar datos reales. El caché PWA solo contiene recursos estáticos, nunca respuestas API ni credenciales. Las actualizaciones del service worker esperan el cierre de las pestañas para no interrumpir ediciones. Requiere HTTPS (localhost admitido).

## Sesiones
GET, autosave y polling no extienden la sesión. Input real de una pestaña visible habilita heartbeat cada 15 s. El servidor decide y no acepta actividad después de vencer. Al detectar 401/timeout, se conserva el borrador, se oculta el editor y se vuelve al acceso. Reingresar recupera exclusivamente la clave del mismo usuario. El bloqueo de editor impide duplicar ediciones entre pestañas; la sincronización de sesión entre pestañas todavía no está implementada y una pestaña inactiva puede pedir reingreso aunque otra siga activa.

## Timeouts/retries
Navegador: 35 s por intento, máximo cuatro intentos y presupuesto de 120 s; pausas 2/5/10 s + jitter y Retry-After. Solo GET o escrituras con idempotency key. Nunca reintentar automáticamente 400/401/403/409/412/428. SQL: helper con presupuesto total 28 s y pausas 5/10 s + jitter según tiempo restante. El futuro driver tendrá 5 s de conexión y comando, conexiones nuevas en reintentos, cancelación por señal; 503 + Retry-After cuando se agota. No se instaló un driver ni se probó Azure sin credenciales. Error de login SQL 18456 no es transitorio.

## API local
GET /api/health; POST /api/session/demo (solo loopback); GET/DELETE /api/session; POST /api/session/activity; GET/PUT /api/orders/:uuid. PUT lleva Idempotency-Key, X-CSRF-Token y If-Match al actualizar. Respuesta ETag = versión entre comillas (contador en demo; rowversion opaco en SQL). Campos aceptados: customerName, plate, mileage, notes, recommendations. Sin credenciales/PII en logs.

## Siguientes etapas
1. Migraciones SQL, repositorios persistentes y pruebas transaccionales contra SQL de desarrollo.
2. Login de usuarios reales, hashes de contraseña, sesiones opacas hasheadas, Secure cookie, roles y auditoría, límites de intentos, expiración y limpieza de almacenamiento por usuario.
3. Pantallas completas, trabajos y precios CRC, cierre con validación, historial, clientes y vehículos, resolución explícita de conflictos y cola de múltiples órdenes.
4. Pruebas end-to-end, accesibilidad, dispositivos e instalación PWA; empaquetado y despliegue Azure. Migración del sistema viejo posteriormente.
