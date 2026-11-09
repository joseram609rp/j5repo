SET XACT_ABORT ON;
SET NOCOUNT ON;
SET LOCK_TIMEOUT 5000;
IF @@TRANCOUNT<>0 OR COALESCE(@confirm,0)<>1 OR @baseline IS NULL
 OR SESSION_CONTEXT(N'j5_admin_mutation') IS NOT NULL
 THROW 51107, 'CLEANUP_GUARD_FAILED', 1;
-- Check identity and known triggers before attempting to take table locks.
EXEC sys.sp_executesql @validate,@triggerParams,@itemsTrigger,@ordersTrigger,@numberTrigger;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE TABLE #Snapshot (
  schema_name sysname NOT NULL, table_name sysname NOT NULL, row_count varchar(20) NOT NULL,
  sha256 varchar(64) NOT NULL, fk_sha256 varchar(64) NOT NULL, PRIMARY KEY(schema_name, table_name)
 );
 EXEC sys.sp_executesql @snapshot,N'@lockTables bit',1;
 EXEC sys.sp_executesql @validate,@triggerParams,@itemsTrigger,@ordersTrigger,@numberTrigger;
 IF (SELECT schema_name,table_name,row_count,sha256,fk_sha256 FROM #Snapshot ORDER BY schema_name,table_name FOR JSON PATH)
     COLLATE Latin1_General_100_BIN2 <> @baseline COLLATE Latin1_General_100_BIN2
  THROW 51108, 'PRECHECK_DRIFT', 1;

 SELECT * INTO #Before FROM #Snapshot;
 DECLARE @items bigint, @orders bigint, @vehicles bigint, @customers bigint;
 EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=1;
 -- The reviewed item trigger recalculates totals and rejects writes on non-OPEN orders.
 UPDATE dbo.Orders SET status='OPEN',closed_at=NULL WHERE status IN ('CLOSED','VOID');
 EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=NULL;
 DELETE FROM dbo.OrderItems;
 SET @items=ROWCOUNT_BIG();
 DELETE FROM dbo.Orders;
 SET @orders=ROWCOUNT_BIG();
 DELETE FROM dbo.Vehicles;
 SET @vehicles=ROWCOUNT_BIG();
 DELETE FROM dbo.Customers;
 SET @customers=ROWCOUNT_BIG();

 IF EXISTS (SELECT 1 FROM dbo.OrderItems) OR EXISTS (SELECT 1 FROM dbo.Orders)
  OR EXISTS (SELECT 1 FROM dbo.Vehicles) OR EXISTS (SELECT 1 FROM dbo.Customers)
  THROW 51109, 'TARGET_NOT_EMPTY', 1;
 IF EXISTS (
  SELECT 1 FROM (VALUES ('OrderItems',@items),('Orders',@orders),('Vehicles',@vehicles),('Customers',@customers)) d(name,deleted)
  LEFT JOIN #Before b ON b.schema_name='dbo' AND b.table_name=d.name
  WHERE b.row_count IS NULL OR CONVERT(bigint,b.row_count)<>d.deleted
 )
  THROW 51110, 'DELETE_COUNT_MISMATCH', 1;

 DELETE FROM #Snapshot;
 EXEC sys.sp_executesql @snapshot,N'@lockTables bit',1;
 EXEC sys.sp_executesql @validate,@triggerParams,@itemsTrigger,@ordersTrigger,@numberTrigger;
 IF EXISTS (
  SELECT * FROM #Before WHERE NOT (schema_name='dbo' AND table_name IN ('OrderItems','Orders','Vehicles','Customers'))
  EXCEPT SELECT * FROM #Snapshot
 ) OR EXISTS (
  SELECT * FROM #Snapshot WHERE NOT (schema_name='dbo' AND table_name IN ('OrderItems','Orders','Vehicles','Customers'))
  EXCEPT SELECT * FROM #Before
 )
  THROW 51111, 'PROTECTED_DATA_CHANGED', 1;
 COMMIT;
 SELECT 'CLEANUP_COMMITTED' AS result,@items AS OrderItems,@orders AS Orders,@vehicles AS Vehicles,@customers AS Customers;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 IF SESSION_CONTEXT(N'j5_admin_mutation') IS NOT NULL
  EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=NULL;
 THROW;
END CATCH;
