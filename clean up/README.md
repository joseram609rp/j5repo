# Entrega limpia de J5

Destino exclusivo: `j5sqlserver.database.windows.net`, base `tallerj5`. La limpieza vacía `dbo.OrderItems`, `dbo.Orders` (OPEN, CLOSED y VOID), `dbo.Vehicles` y `dbo.Customers`. Compara el contenido de todas las demás tablas por conteo y SHA-256, incluyendo todo `legacy`, todos los usuarios, catálogo, migraciones, sesiones, auditoría e idempotencia. Las migraciones y la secuencia quedan intactas.

## Verificaciones obligatorias

1. Confirmar la identidad del recurso en Azure y revisar la retención y el intervalo disponible de recuperación a un punto en el tiempo. Tras suspender escrituras, verificar una restauración de un punto dentro de esa ventana de mantenimiento en una base separada, con acceso restringido. Comparar los conteos y hashes del punto recuperado contra la base de origen. Registrar referencia de la operación y hora UTC del punto restaurado.
2. Coordinar todos los dispositivos y perfiles J5, incluidos los que estén desconectados. Identificar y resolver borradores pendientes o conflictos. Cerrar los clientes, suspender escrituras de las API, trabajos, integraciones y otras conexiones de ambas ramas, y verificar que se mantengan suspendidas hasta concluir el postcheck. Ver [revisión de dispositivos](04_clear_local_cache.md).
3. Ejecutar el precheck con la configuración SQL autorizada y permisos de lectura y `VIEW DEFINITION` a nivel de base. Revisar que los datos operativos sean exclusivamente de prueba, el catálogo tenga las 57 marcas y 986 modelos esperados, el archivo incluya las 16.289 órdenes y 13.219 vehículos esperados y se cumplan 17 o más migraciones. Investigar cualquier diferencia antes de continuar. Verificar dependencias y que toda referencia SQL entrante pueda resolverse dentro de las cuatro tablas.
4. Conservar evidencia operativa fuera de Git. Preparar un JSON con `server`, `database`, `azureRestoreOperation`, `restorePointUtc`, `writesSuspendedAt`, `maintenanceExpiresAt` y los booleanos `restoreVerified`, `offlineQueuesVerifiedEmpty`, `writesSuspended`, `onlyTestDataVerified` y `protectedCountsReviewed`. Usar fechas ISO 8601 UTC. Registrar estos campos únicamente después de verificar las condiciones. El runner valida el documento y su vigencia, pero la evidencia de Azure y los dispositivos se verifica fuera de SQL.

## Ejecución desde PowerShell

Con Node y dependencias del repo instaladas, usar el `.env` local ignorado o una identidad Azure autorizada. Guardar evidencia y resultados en un directorio privado fuera del repo.

```powershell
& '.\clean up\run-cleanup.ps1' -Mode precheck -BaselinePath $baseline
& '.\clean up\run-cleanup.ps1' -Mode cleanup -BaselinePath $baseline -EvidencePath $evidence -ConfirmTestDataDelete
& '.\clean up\run-cleanup.ps1' -Mode postcheck -BaselinePath $baseline
```

El modo cleanup ejecuta el postcheck de solo lectura después del commit. Mantener la pausa de escrituras hasta confirmar `CLEANUP_COMMITTED`, `POSTCHECK_OK`, cuatro conteos en cero y coincidencia de tablas protegidas. Si hay desconexión o timeout, conservar la pausa y comprobar el estado con postcheck antes de considerar un nuevo intento.

La ejecución valida claves foráneas y el código exacto de los triggers revisados. Dentro de la transacción toma bloqueos exclusivos, contrasta el estado con el precheck y reabre las órdenes cerradas o anuladas temporalmente para respetar el trigger de ítems. Los triggers quedan habilitados. Un error o diferencia antes del commit revierte la transacción. La ejecución requiere DELETE en las cuatro tablas y UPDATE en Orders. Si la validación o el acceso a restauración falla, detenerse antes del borrado.
