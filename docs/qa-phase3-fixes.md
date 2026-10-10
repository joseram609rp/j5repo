# Correcciones del ciclo de órdenes

Registro técnico resumido; el comportamiento vigente está en [README](../README.md) y [arquitectura](architecture.md). No contiene un registro de datos ni conteos operativos de QA.

- Contacto: cierre válido actualiza el maestro de cliente sin cambiar cédula; snapshots previos no cambian.
- Validación: aviso inferior local desaparece al corregir campos o navegar; no queda como mensaje global.
- Numeración: 011 incorpora fecha UTC-6 y consecutivo diario OT-YYYYMMDD-NN, applock y unicidad. Conserva UUID/order_number; backfill puede cambiar rowversion y exigir revisar borradores offline. No hay alias de búsqueda para identificadores antiguos.
- Selección: cambiar cliente manteniendo vehículo conserva sus campos y limpia contacto; navegación u otro vehículo descartan ese modo.
- Dueño: la regla actual permite MECHANIC y ADMIN y decisión explícita al cierre. Sustituye la restricción ADMIN-only documentada en revisiones previas.
- Concurrencia: reasignar solo OPEN, close/void según mecánico asignado o ADMIN, snapshot/idempotencia/ETag y revisión de conflictos.

Ver [correcciones de seguridad y placas](phase3-qa-fixes-2026-10-10.md). Las suites SQL prueban rollback; no sustituyen carga con commits reales ni recorrido en dispositivos físicos.
