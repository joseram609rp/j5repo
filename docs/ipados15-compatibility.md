# Compatibilidad controlada con Chrome en iPadOS 15.8.8

Fecha: 2026-11-08. Estado: implementación verificada localmente; aceptación en iPad real pendiente.

## Base y alcance

- Repositorio original limpio antes de trabajar, en una rama distinta; se conservó su checkout.
- Se actualizó origin con fetch: dev local estaba en 0c47e1d y origin/dev avanzó de 7f346c2 a d8f5516.
- Base elegida: d8f5516, merge de Historial anterior (#7); contiene be6f5a6.
- Rama nueva: fix/ipados15-compatibility, en un worktree aislado.
- Sin cambios en main/dev, backend, SQL, migraciones, datos, secretos, dependencias, lockfile ni CI/CD. Sin merge, PR, despliegue ni cleanup DB.

## Diagnóstico e inventario

Chrome instalado en este iPad usa WebKit del sistema; cambiar de marca de navegador no agrega las APIs de Chromium de escritorio. No se requiere instalar una versión más reciente de Chrome.

| Uso / ubicación | Diagnóstico y decisión |
| --- | --- |
| AbortSignal.timeout, api.ts | Llamada incondicional antes de fetch. Al faltar produce TypeError; bootstrap termina en SESSION_CHECK_FAILED tras reintentos. Reproducción por feature detection y pruebas con la API ausente; causa técnica consistente con el síntoma, sin confirmar aún la tablet. Se añade fallback. |
| AbortController, fetch, Headers, DOMException, timers | Base compatible; no se usa AbortSignal.any ni throwIfAborted. reason puede faltar: cancelación usa AbortError como alternativa. |
| navigator.locks, App.tsx | Se conserva el bloqueo exclusivo por usuario y ifAvailable. Cuando falta, consulta de listas y Historial anterior disponible; creación/entrada al editor deshabilitada y borradores intactos. También impide abrir detalles del editor actual; no se promete editor de solo lectura en ese caso. No se implementa un candado inseguro con localStorage. |
| IndexedDB / idb, autosave.ts | Transacciones y claves por usuario/orden, migración local, getAll y IDBKeyRange. Sin cambio de esquema ni borrado. Pruebas con fake-indexeddb; persistencia, cuotas, suspensión y expulsión de datos del iPad requieren QA real. |
| crypto.randomUUID, autosave.ts y Users.tsx | IDs e idempotencia. Disponible desde Safari 15.4 en contexto seguro; se conserva para el objetivo 15.8.8. No se sustituye por Math.random. HTTP remoto no está soportado como entorno de aceptación. |
| structuredClone, autosave.ts y ConflictReview.tsx | Disponible desde Safari 15.4; mantiene undefined y copias profundas de borradores. Se conserva, sin serialización JSON destructiva. No se promete soporte de runtime Safari 15.0–15.3. |
| Array.at, OrderList.tsx | Sustituido único uso productivo por acceso por índice para reducir el requisito de API. Los usos en pruebas se ejecutan en Node. |
| Promise.allSettled, Object.fromEntries, Object.assign, Set/Map/WeakMap, Proxy, Symbol, Intl/Date.toLocaleString, URL/URLSearchParams, TextEncoder, Blob/descarga, eventos de conexión/visibilidad | Inventario por búsqueda de fuentes; no se halló necesidad de polyfill para WebKit 15.8. El comportamiento de descarga, fechas y suspensión debe validarse en dispositivo. |
| Sintaxis frontend y validaciones compartidas | TypeScript ES2022 es la entrada de compilación, no garantía de runtime. Vite transpila el bundle final incluyendo dependencias hacia safari15. Se mantienen chrome107/edge107/firefox104 del default Vite 7. CSS también apunta a safari15. No se añaden bundles legacy ni downgrade. |
| React / React DOM 19.3.0 | Bundle productivo revisado; primitivas DOM, Promise, Map/Set y AbortSignal. Smoke real de arranque/login con Edge y APIs ausentes pasó. Esto no certifica cada ruta de React en WebKit 15. |
| idb 8.0.3 | Proxy/WeakMap, promesas e IndexedDB; APIs disponibles en el objetivo. No cambia la librería ni su esquema. |
| Zod 4.6.5 | Validaciones compartidas incluidas en bundle. Regex y compilación dinámica tienen rutas propias; no se encontraron lookbehinds en regexes.js revisado. Warnings de anotación PURE de Rollup no impiden compilar. Build y pruebas de validación pasan; queda pendiente ejecución completa en WebKit 15. |
| Vite 7.3.6 / plugin-react 5.2.0 / TypeScript 5.9.3 | Herramientas de build en Node 24.20.0; no se ejecuta Node en la tablet. Se usa lockfile congelado; no cambios de versiones. |
| vite-plugin-pwa 1.3.0 / Workbox 7.4.1 | SW generado, registro condicional y errores de registro no bloqueantes. Precaché de archivos estáticos; sin caché runtime de API; navegación excluye /api/. Actualización con prompt, sin skipWaiting automático ni clientsClaim. Build produce sw.js y Workbox. No se presume instalación PWA de Chrome iOS equivalente a Safari. |
| Cookies / CSRF | Peticiones relativas /api, credentials same-origin; cookie HttpOnly, SameSite=Strict, Path=/api y Secure en producción. Cabeceras CSRF, If-Match e Idempotency-Key conservadas. Sin evidencia para cambiar backend/cookies. Validación de sesión real y políticas del dispositivo pendiente. |

Las versiones efectivamente instaladas proceden de pnpm-lock.yaml; el package.json contiene rangos.

## Cambios mínimos

- frontend/src/request-signal.ts: timeout nativo si existe; en su ausencia AbortController y setTimeout. Combina señal externa, detecta cancelación previa y permite cancelar la espera entre reintentos.
- frontend/src/api.ts: integra la señal por intento y libera listeners/temporizador después del cuerpo JSON y antes de esperar/reintentar, también en finally. Conserva presupuestos de 60 s login / 120 s general, timeout de hasta 35 s, Retry-After, backoff, límites, clasificación de errores e identidad de escrituras. Una cancelación externa nunca se reintenta.
- El timeout nativo no ofrece cancelación de su temporizador interno: se desuscribe el listener; el temporizador del fallback sí se cancela. La suspensión del sistema puede pausar timers; los presupuestos se verifican con el reloj al reintentar.
- frontend/vite.config.ts: target JS y CSS Safari 15, manteniendo los otros targets.
- frontend/src/App.tsx: explica la limitación de locks y ofrece orientación de conexión/servicio y preservación de borradores cuando bootstrap falla.
- frontend/src/OrderList.tsx: acceso compatible al último elemento.
- frontend/src/request-signal.test.ts: 10 pruebas de ruta nativa, ausencia de API, timeout, cancelación y limpieza, bootstrap 401/network/503 e identidad ETag/CSRF/idempotencia.
- frontend/src/orders-ui.test.tsx: mensaje actualizado y comprobación de botón deshabilitado y borrador sin escrituras cuando faltan locks.
- Este documento.

## Evidencia y comandos

1. git status --short --branch, git fetch origin, git log origin/dev y comprobación de ancestro de Historial anterior: base confirmada; original sin modificaciones.
2. pnpm install --frozen-lockfile --ignore-scripts: correcto, sin modificar lockfile. Instalación inicialmente restringida por permisos; repetida con acceso autorizado.
3. pnpm check: typecheck de ambos paquetes pasó; batería completa inicial: 321 aprobadas / 41 omitidas (SQL). El build inicialmente falló por acceso a directorios antecesores de esbuild, no por código.
4. pnpm build con acceso de archivos autorizado: correcto en backend y frontend; Vite 7.3.6, 145 módulos, bundle JS ~382.6 kB, CSS ~6.97 kB; PWA generada, 7 recursos precacheados. Dos warnings de anotaciones PURE de Zod.
5. Tras ampliar las pruebas: pnpm exec vitest run frontend/src/orders-ui.test.tsx frontend/src/request-signal.test.ts: 75/75 correctas; pnpm --filter @j5/frontend typecheck correcto. El total lógico pasa de 321 a 324 por tres casos añadidos; no se presenta como una segunda ejecución completa.
6. Smoke del build servido en 127.0.0.1, con Playwright instalado fuera del repositorio y Edge 156.0.4314.58: 2/2 escenarios correctos, cero pageerror. Moderno: login y editor habilitado; sin timeout/locks: login correcto y creación deshabilitada. Ambos abren Historial anterior y registran SW. Ocho peticiones a fixtures locales; ninguna a producción. Script adjunto al reporte de entrega.
7. git diff --check: correcto. Revisión del diff limitada a frontend, tests y este documento; sin archivos de entorno, datos privados ni salida dist versionados.

No se ejecutaron las 41 pruebas SQL que requieren entorno/conexión real. Las pruebas cubren autosave, recuperación offline, idempotencia, conflictos/ETag, catálogo, navegación, órdenes abiertas/cerradas, autenticación, CSRF y consulta histórica mediante dobles de prueba; no prueban Azure SQL ni cookies reales del iPad.

**No hay ejecución de WebKit 15 ni acceso al iPad físico.** Target de compilación y ausencia simulada de APIs en Edge son evidencia parcial, no equivalen a ese motor. Chrome/Edge modernos tienen pruebas de componentes y smoke Edge; Safari moderno también requiere QA real. La compatibilidad final sigue pendiente.

## Checklist de aceptación en la tablet

Usar un entorno de prueba HTTPS autorizado con esta rama y datos ficticios; esta tarea no lo despliega. Anotar modelo, iPadOS 15.8.8 y versión de Chrome instalada; no exigir actualizar Chrome. No borrar datos del sitio ni reinstalar mientras existan borradores sin recuperar.

- [ ] Abrir Chrome normal: se muestra comprobación breve y, con 401, formulario de login; sin error de API JavaScript.
- [ ] Iniciar sesión válida; credenciales inválidas muestran rechazo sin bucles; cerrar y reabrir conserva sesión según política vigente.
- [ ] Probar red interrumpida y servicio 503 en entorno de pruebas: al agotarse reintentos aparece orientación útil y Reintentar; no se confunde con 401. Login puede esperar hasta 60 s y bootstrap hasta su presupuesto existente.
- [ ] Con inspección remota cuando sea posible, registrar solo capacidades booleanas: typeof AbortSignal.timeout, typeof navigator.locks?.request, typeof crypto.randomUUID, typeof structuredClone, existencia de indexedDB y serviceWorker, isSecureContext. No copiar cookies, tokens, contraseñas ni datos de clientes.
- [ ] Si locks falta, comprobar aviso, botón Nueva orden deshabilitado, listas e Historial anterior accesibles y borradores conservados. No aceptar edición insegura como solución.
- [ ] Si locks está disponible, crear orden ficticia, cargar catálogo/marca/modelo, buscar cliente/vehículo, editar y comprobar autosave.
- [ ] Abrir segunda pestaña: no puede apropiarse del editor mientras primera mantiene lock. Cerrar primera y recargar segunda permite adquirirlo.
- [ ] Offline con un borrador ya cargado: editar, recargar y recuperar; volver online sincroniza una sola vez sin duplicar orden/items. Suspender/reanudar iPad, revisar cuotas y persistencia.
- [ ] Simular conflicto ETag desde otro navegador: revisión preserva copia local y no sobrescribe silenciosamente. Reintentar escritura tras corte conserva idempotencia.
- [ ] Abrir listas, paginar, consultar órdenes abiertas/cerradas, cerrar/reabrir con permisos adecuados, comprobar fechas, importes, teclado y scroll.
- [ ] Historial anterior: búsqueda, fechas vacías, paginación, detalle e importe cero; ninguna edición ni petición de escritura a archivo histórico.
- [ ] Verificar cookie same-origin y CSRF con el servidor real de pruebas sin registrar valores sensibles; no deben aparecer 403/401 espurios.
- [ ] Reabrir app con SW existente; comprobar actualización por prompt con borrador pendiente, recursos offline y ausencia de caché de respuestas de API. No limpiar almacenamiento para forzar una actualización.
- [ ] Repetir flujos clave en Chrome/Edge modernos y Safari moderno, con una y dos pestañas.

## Fuentes técnicas

- Vite 7, targets y esbuild: https://v7.vite.dev/config/build-options
- WebKit Safari 15.4, structuredClone, UUID y locks: https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/
- Semántica de AbortSignal.timeout (TimeoutError y tiempo activo): https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static

No se atribuye al build la capacidad de polyfillear APIs de runtime. Si la tablet revela otra API ausente, se requiere evidencia y una corrección acotada antes de aprobar compatibilidad final.
