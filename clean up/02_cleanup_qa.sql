-- DESTRUCTIVE DEV/QA ONLY. Stop all API instances and J5 browser tabs first.
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @ConfirmCleanup bit=0; -- Change to 1 only in an explicitly approved manual copy.
DECLARE @ResetOrderNumber bit=1; -- QA/initial delivery only; production requires explicit decision.
IF @ConfirmCleanup<>1 THROW 51101,'CONFIRM_CLEANUP_REQUIRED',1;
IF DB_NAME()<>'tallerj5' THROW 51100,'TARGET_MISMATCH',1;
IF @@TRANCOUNT<>0 THROW 51102,'EXISTING_TRANSACTION',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @Expected TABLE(name sysname PRIMARY KEY);
 INSERT @Expected VALUES ('Users'),('Sessions'),('IdempotencyRequests'),('AuditLogs'),('OrderItems'),('Orders'),('Vehicles'),('Customers'),('SchemaMigrations'),('VehicleMakes'),('VehicleModels');
 IF EXISTS(SELECT name FROM @Expected EXCEPT SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo'))
 OR EXISTS(SELECT name FROM sys.tables WHERE is_ms_shipped=0 AND (schema_id<>SCHEMA_ID('dbo') OR name NOT IN(SELECT name FROM @Expected))) THROW 51103,'UNEXPECTED_SCHEMA',1;
 IF (SELECT COUNT(*) FROM dbo.SchemaMigrations)<>10
 OR EXISTS(SELECT name FROM dbo.SchemaMigrations WHERE name NOT IN('001_core.sql','002_receipts_audit.sql','003_order_guards.sql','004_vehicle_model.sql','005_closed_notes.sql','006_open_order_selection.sql','007_optional_notes_year.sql','008_open_mechanic_reassignment.sql','009_order_billing.sql','010_vehicle_catalog.sql')) THROW 51103,'UNEXPECTED_MIGRATIONS',1;
 IF NOT EXISTS(SELECT 1 FROM sys.triggers WHERE object_id=OBJECT_ID('dbo.TR_Orders_Guard') AND is_disabled=0)
 OR NOT EXISTS(SELECT 1 FROM sys.triggers WHERE object_id=OBJECT_ID('dbo.TR_OrderItems_Total') AND is_disabled=0) THROW 51103,'UNEXPECTED_TRIGGERS',1;
 IF OBJECT_ID('dbo.OrderNumber','SO') IS NULL OR COL_LENGTH('dbo.Orders','tax_rate') IS NULL OR COL_LENGTH('dbo.OrderItems','notes') IS NULL THROW 51103,'UNEXPECTED_SCHEMA',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.Users WITH(TABLOCKX,HOLDLOCK) WHERE role='ADMIN') THROW 51104,'ADMIN_REQUIRED',1;
 SELECT * INTO #AdminsBefore FROM dbo.Users WHERE role='ADMIN';
IF (SELECT COUNT(*) FROM dbo.VehicleMakes)<>57 OR (SELECT COUNT(*) FROM dbo.VehicleModels)<>986
 OR EXISTS(SELECT 1 FROM dbo.VehicleModels v LEFT JOIN dbo.VehicleMakes m ON m.id=v.make_id WHERE m.id IS NULL)
 THROW 51108,'CATALOG_INTEGRITY_FAILED',1;
 SELECT * INTO #MakesBefore FROM dbo.VehicleMakes WITH(TABLOCKX,HOLDLOCK);
 SELECT * INTO #ModelsBefore FROM dbo.VehicleModels WITH(TABLOCKX,HOLDLOCK);
 SELECT * INTO #MigrationsBefore FROM dbo.SchemaMigrations;
 DECLARE @Rows bigint;
 SELECT @Rows=COUNT_BIG(*) FROM dbo.SchemaMigrations WITH(TABLOCKX,HOLDLOCK);
 SELECT @Rows=COUNT_BIG(*) FROM dbo.Sessions WITH(TABLOCKX,HOLDLOCK);
 SELECT @Rows=COUNT_BIG(*) FROM dbo.IdempotencyRequests WITH(TABLOCKX,HOLDLOCK);
 SELECT @Rows=COUNT_BIG(*) FROM dbo.AuditLogs WITH(TABLOCKX,HOLDLOCK);
 SELECT @Rows=COUNT_BIG(*) FROM dbo.OrderItems WITH(TABLOCKX,HOLDLOCK);
 SELECT @Rows=COUNT_BIG(*) FROM dbo.Orders WITH(TABLOCKX,HOLDLOCK);
 SELECT @Rows=COUNT_BIG(*) FROM dbo.Vehicles WITH(TABLOCKX,HOLDLOCK);
 SELECT @Rows=COUNT_BIG(*) FROM dbo.Customers WITH(TABLOCKX,HOLDLOCK);
 EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=1;
 UPDATE dbo.Orders SET status='OPEN',closed_at=NULL WHERE status<>'OPEN';
 EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=NULL;
 DELETE FROM dbo.Sessions;
 DELETE FROM dbo.IdempotencyRequests;
 DELETE FROM dbo.AuditLogs;
 DELETE FROM dbo.OrderItems;
 DELETE FROM dbo.Orders;
 DELETE FROM dbo.Vehicles;
 DELETE FROM dbo.Customers;
 DELETE FROM dbo.Users WHERE role<>'ADMIN';
 IF EXISTS(SELECT 1 FROM dbo.Sessions) THROW 51106,'QA_POSTCHECK_FAILED',1;
IF EXISTS(SELECT 1 FROM dbo.IdempotencyRequests) THROW 51106,'QA_POSTCHECK_FAILED',1;
IF EXISTS(SELECT 1 FROM dbo.AuditLogs) THROW 51106,'QA_POSTCHECK_FAILED',1;
IF EXISTS(SELECT 1 FROM dbo.OrderItems) THROW 51106,'QA_POSTCHECK_FAILED',1;
IF EXISTS(SELECT 1 FROM dbo.Orders) THROW 51106,'QA_POSTCHECK_FAILED',1;
IF EXISTS(SELECT 1 FROM dbo.Vehicles) THROW 51106,'QA_POSTCHECK_FAILED',1;
IF EXISTS(SELECT 1 FROM dbo.Customers) THROW 51106,'QA_POSTCHECK_FAILED',1;
 IF EXISTS(SELECT 1 FROM dbo.Users WHERE role<>'ADMIN')
 OR EXISTS(SELECT * FROM #AdminsBefore EXCEPT SELECT * FROM dbo.Users WHERE role='ADMIN')
 OR EXISTS(SELECT * FROM dbo.Users WHERE role='ADMIN' EXCEPT SELECT * FROM #AdminsBefore) THROW 51105,'ADMIN_CHANGED',1;
 IF EXISTS(SELECT * FROM #MigrationsBefore EXCEPT SELECT * FROM dbo.SchemaMigrations)
 OR EXISTS(SELECT * FROM dbo.SchemaMigrations EXCEPT SELECT * FROM #MigrationsBefore) THROW 51107,'MIGRATIONS_CHANGED',1;
IF (SELECT COUNT(*) FROM dbo.VehicleMakes)<>57 OR (SELECT COUNT(*) FROM dbo.VehicleModels)<>986
 OR EXISTS(SELECT 1 FROM dbo.VehicleModels v LEFT JOIN dbo.VehicleMakes m ON m.id=v.make_id WHERE m.id IS NULL)
 THROW 51108,'CATALOG_INTEGRITY_FAILED',1;
 IF EXISTS(SELECT * FROM #MakesBefore EXCEPT SELECT * FROM dbo.VehicleMakes) OR EXISTS(SELECT * FROM dbo.VehicleMakes EXCEPT SELECT * FROM #MakesBefore)
 OR EXISTS(SELECT * FROM #ModelsBefore EXCEPT SELECT * FROM dbo.VehicleModels) OR EXISTS(SELECT * FROM dbo.VehicleModels EXCEPT SELECT * FROM #ModelsBefore) THROW 51108,'CATALOG_CHANGED',1;
 IF @ResetOrderNumber=1 ALTER SEQUENCE dbo.OrderNumber RESTART WITH 1;
 COMMIT;
 SELECT 'CLEANUP_COMMITTED' AS result,@ResetOrderNumber AS order_number_reset;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=NULL;
 THROW;
END CATCH;
