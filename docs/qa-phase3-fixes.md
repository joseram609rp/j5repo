# Correcciones QA Phase 3 — 2026-10-09

Repositorio C:/j5repo, branch feature/orders-mvp, HEAD a2550244f4cf53d08aedf9e853e8eb55823f6895. Estado inicial limpio. No commit, merge, push, cleanup ni llamadas CarsXE.

## Causas y correcciones

1. Customers se insertaba/reutilizaba, pero el cierre no actualizaba nombre/teléfono/email. Ahora el cierre válido actualiza el maestro dentro de la misma transacción, después de guardar la orden; no cambia cédula. Autosaves de clientes existentes no actualizan contacto. Los snapshots anteriores permanecen en draft_data. La selección de vehículo ahora aplica todos los datos del dueño actual incluso si el editor tenía otro cliente cargado.
2. El intento de cierre calculaba errores inline y resumen superior, pero no tenía aviso cerca de las acciones. Se agregó un aviso inferior local derivado de closing y validaciones actuales. Desaparece al completar los campos, cerrar, salir o cambiar editorId; no usa globalMessage.
3. El identificador anterior usaba año UTC y secuencia global. 011 agrega order_date y daily_order_number. El backfill particiona por fecha de created_at menos seis horas y ordena por created_at/order_number. El display es OT-YYYYMMDD-NN, mínimo dos dígitos, sin truncar 100+. Los inserts asignan consecutivos mediante trigger y applock de transacción; backend adquiere el mismo lock antes de INSERT. Índice único por fecha/consecutivo. Rollback revierte la asignación; order_number global permanece para paginación. Buscar OT-20261009 encuentra CLOSED de ese día sin distinguir mayúsculas; conserva búsqueda de OT completa y cursor estable.
4. keepVehicle conservaba campos pero no suprimía mismatch, y ownerDecision dependía de toda la cédula, por lo que cada dígito reactivaba el aviso. El modo local ahora suprime mismatch y presenta una sola ayuda estable. Cambiar cliente conserva vehicleId/plate/make/model/year y limpia todos los campos del cliente. ADMIN puede confirmar cuando existen referencias válidas; MECHANIC no tiene la acción y el backend sigue prohibiéndola. Transferencia exitosa refresca dueño, limpia modo/avisos y conserva historial. Otro vehículo o navegación descartan el modo.

## Archivos

- backend/src/sql.ts: contacto actual al cierre, búsqueda OT sin distinguir mayúsculas, bloqueo de asignación diaria.
- backend/src/verify-sql.ts: 11 migraciones y columnas/índice/trigger diario.
- database/migrations/011_daily_order_numbers.sql: nuevo esquema, backfill y asignación diaria. 001–010 intactas.
- frontend/src/App.tsx: banner inferior y reset local.
- frontend/src/EntitySearch.tsx: carga completa del dueño y modo de cambio de cliente.
- frontend/src/orders-ui.test.tsx: contacto seleccionado, dígitos sin warnings, permisos/confirmación única, limpieza tras transferencia/navegación, banner y corrección.
- backend/test/orders-sql.integration.test.ts: contacto maestro/snapshots, frontera UTC-6, 01/02/03 y 100+, prefijo/paginación y bloqueo entre transacciones.
- backend/test/sql.integration.test.ts: aserción del nuevo formato.
- clean up/01_precheck.sql, 02_cleanup_qa.sql, 03_postcheck.sql y README.md: 11 migraciones y verificación del trigger; conservación completa de VehicleMakes/VehicleModels y snapshots antes/después sin cambios.
- README.md y database/README.md: comportamiento actualizado.

## Validación

- pnpm check: PASS, 219 pruebas locales, tipos y builds; 22 SQL omitidas en este comando por diseño.
- pnpm db:migrate: 011 aplicada a tallerj5. db:verify PASS: 11 migraciones, 57 marcas, 986 modelos, cero duplicados/huérfanos, índices y trigger habilitados.
- Generador del catálogo --check y git diff --check: PASS.
- .env ignorado, no tracked y nada staged; HEAD y branch preservados.
- La prueba del banner falló en el baseline y pasó con la corrección. La prueba de dígitos se confirmó también contra EntitySearch original, restaurando la corrección inmediatamente. La prueba de contacto también falló contra el backend original: conservaba nombre/email/teléfono anteriores tras close. Las pruebas SQL verifican estado real con rollback; no se hizo reproducción visual en navegador.
- pnpm test:sql: PASS, 22/22 pruebas SQL rollback-only.

## QA pendiente y límites

Probar en navegador con ADMIN y dos MECHANIC: selección de cliente y vehículo con email/teléfono; cierre válido y revisión de una orden anterior; escritura dígito a dígito tras cambio de cliente; transferencia única; banner inferior al corregir y navegar; búsqueda por prefijo diario; PWA/offline y conflictos.

La concurrencia se comprueba mediante exclusión del lock entre dos transacciones rollback-only y unicidad de múltiples inserts; no se ejecutó carga con commits simultáneos reales. El lock tiene timeout de cuatro segundos, por lo que conviene probar contención en QA.

011 cambia los identificadores visibles de las órdenes existentes y sus rowversions durante backfill; los UUID y snapshots permanecen. Borradores offline anteriores pueden requerir revisión de conflicto. No se reparó retroactivamente el contacto maestro ya obsoleto: se actualizará al próximo cierre válido del cliente. Los IDs visibles del formato anterior no reciben alias de búsqueda.
