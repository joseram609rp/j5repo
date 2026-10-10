# Correcciones técnicas Phase 3

Este documento conserva el resultado técnico de la revisión, sin datos de cuentas, clientes, vehículos, órdenes ni estados de la base QA. Los relatos operativos anteriores fueron retirados del HEAD; siguen pudiendo existir en commits históricos.

- Login: bloqueo persistente SQL tras cinco fallos durante 15 minutos, con receipts para evitar doble conteo por COMMIT ambiguo; dummy compare y revocación de sesiones en reset.
- Usuarios: username canónico único y constraint corregida por 014; desbloqueo, ocultación de inactivos y borrado físico exclusivamente para inactivos sin referencias.
- Placas: normalización uppercase/sin espacios ni guiones y 3..12 caracteres ASCII alfanuméricos; 013 cubre vehículos y 015 el trigger de cierre.
- Dueño: MECHANIC/ADMIN pueden transferir explícitamente. El cierre exige una decisión ligada a cliente/vehículo/dueño esperado si difieren; default de UI transferir, alternativa conservar. El servidor rechaza decisiones obsoletas y conserva snapshots históricos.
- Clientes: contacto maestro actualizado solo en cierre válido; cédula inmutable y snapshots por orden conservados.
- Kilometraje: selección recupera última lectura no nula, incluyendo VOID y sin perderla por órdenes posteriores vacías.
- UI: mensajes acotados al editor y acción actuales, banners derivados de validaciones locales, navegación sin mensajes tardíos de otras órdenes.
- Fiabilidad: savepoint revierte efectos de un rechazo de negocio antes de persistir receipt; ETag/idempotencia y recuperación local conservan cambios ante conflictos.

Migraciones 001–015 permanecen intactas. Validación actual en [verification.md](verification.md); contratos en [architecture.md](architecture.md). QA física móvil/tablet y despliegue DEV siguen pendientes.
