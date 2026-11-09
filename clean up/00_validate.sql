IF COALESCE(CONVERT(nvarchar(128), SERVERPROPERTY('ServerName')), '') NOT IN
   (N'j5sqlserver', N'j5sqlserver.database.windows.net')
 OR DB_NAME() <> N'tallerj5' OR CONVERT(int, SERVERPROPERTY('EngineEdition')) <> 5
 THROW 51100, 'TARGET_MISMATCH', 1;
IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION'), 0) <> 1
 THROW 51101, 'COMPLETE_METADATA_REQUIRED', 1;

DECLARE @targets TABLE (object_id int NOT NULL PRIMARY KEY, delete_order int NOT NULL);
INSERT @targets VALUES (OBJECT_ID('dbo.OrderItems','U'),1), (OBJECT_ID('dbo.Orders','U'),2),
 (OBJECT_ID('dbo.Vehicles','U'),3), (OBJECT_ID('dbo.Customers','U'),4);

-- Inspect every incoming FK, even disabled ones. Never cascade outside the allowlist.
IF EXISTS (
 SELECT 1 FROM sys.foreign_keys f
 JOIN @targets parent ON parent.object_id=f.referenced_object_id
 LEFT JOIN @targets child ON child.object_id=f.parent_object_id
 WHERE child.object_id IS NULL OR child.delete_order>=parent.delete_order
    OR f.delete_referential_action<>0 OR f.update_referential_action<>0
    OR f.is_disabled=1 OR f.is_not_trusted=1
)
 THROW 51102, 'UNSAFE_INCOMING_FK', 1;
IF EXISTS (
 SELECT 1 FROM sys.foreign_keys f JOIN @targets t ON t.object_id=f.parent_object_id
 WHERE f.is_disabled=1 OR f.is_not_trusted=1
)
 THROW 51103, 'UNTRUSTED_TARGET_FK', 1;

DECLARE @reviewed TABLE (name sysname NOT NULL, parent_id int NOT NULL, sha256 binary(32) NOT NULL);
INSERT @reviewed VALUES
 (N'TR_OrderItems_Total',OBJECT_ID('dbo.OrderItems'),@itemsTrigger),
 (N'TR_Orders_Guard',OBJECT_ID('dbo.Orders'),@ordersTrigger),
 (N'TR_Orders_DailyNumber',OBJECT_ID('dbo.Orders'),@numberTrigger);

-- Azure can rewrite the CREATE/ALTER header. Match the reviewed text from TRIGGER onward.
DECLARE @actual TABLE (name sysname NOT NULL, parent_id int NOT NULL, sha256 binary(32) NULL, enabled bit NOT NULL);
DECLARE @whitespace nvarchar(4)=N' '+NCHAR(9)+NCHAR(10)+NCHAR(13);
INSERT @actual
SELECT tr.name,tr.parent_id,
 CASE WHEN position.start_at>0
   AND REPLACE(REPLACE(REPLACE(REPLACE(LEFT(m.definition,
    CASE WHEN position.start_at>0 THEN position.start_at-1 ELSE 0 END),
    N' ',N''),NCHAR(9),N''),NCHAR(10),N''),NCHAR(13),N'')
    COLLATE Latin1_General_100_BIN2 IN (N'CREATE',N'ALTER',N'CREATEORALTER')
  THEN HASHBYTES('SHA2_256',TRIM(@whitespace FROM
   REPLACE(SUBSTRING(m.definition,position.start_at,2147483647),CHAR(13)+CHAR(10),CHAR(10))))
 END,
 CASE WHEN tr.is_disabled=0 AND tr.is_instead_of_trigger=0 AND tr.is_not_for_replication=0 THEN 1 ELSE 0 END
FROM sys.triggers tr JOIN @targets t ON t.object_id=tr.parent_id
LEFT JOIN sys.sql_modules m ON m.object_id=tr.object_id
CROSS APPLY (VALUES (CHARINDEX(N'TRIGGER dbo.',m.definition COLLATE Latin1_General_100_BIN2))) position(start_at);
IF EXISTS (
 SELECT name,parent_id,sha256 FROM @actual
 EXCEPT SELECT name,parent_id,sha256 FROM @reviewed
) OR EXISTS (
 SELECT name,parent_id,sha256 FROM @reviewed
 EXCEPT SELECT name,parent_id,sha256 FROM @actual WHERE enabled=1
)
 THROW 51104, 'TRIGGER_DRIFT', 1;

IF EXISTS (SELECT 1 FROM sys.security_policies WHERE is_enabled=1)
 OR EXISTS (
 SELECT 1 FROM sys.tables s JOIN @targets t ON t.object_id=s.object_id
 WHERE s.temporal_type<>0 OR s.is_tracked_by_cdc=1 OR s.is_memory_optimized=1
    OR s.ledger_type<>0 OR s.is_filetable=1
 )
 OR EXISTS (SELECT 1 FROM sys.change_tracking_tables c JOIN @targets t ON t.object_id=c.object_id)
 OR EXISTS (SELECT 1 FROM sys.masked_columns WHERE is_masked=1)
 THROW 51105, 'UNREVIEWED_TABLE_FEATURE', 1;

IF OBJECT_ID('legacy.WorkOrders','U') IS NULL OR OBJECT_ID('legacy.Vehicles','U') IS NULL
 OR OBJECT_ID('legacy.ImportBatches','U') IS NULL OR OBJECT_ID('legacy.ImportIssues','U') IS NULL
 OR OBJECT_ID('legacy.Mechanics','U') IS NULL
 OR NOT EXISTS (SELECT 1 FROM dbo.Users WHERE role='ADMIN')
 OR (SELECT COUNT_BIG(*) FROM dbo.SchemaMigrations)<17
 OR NOT EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE name='017_legacy_archive.sql')
 OR EXISTS (SELECT 1 FROM dbo.VehicleModels v LEFT JOIN dbo.VehicleMakes m ON m.id=v.make_id WHERE m.id IS NULL)
 OR EXISTS (SELECT 1 FROM dbo.Orders WHERE status IS NULL OR status NOT IN ('OPEN','CLOSED','VOID'))
 THROW 51106, 'DATA_INTEGRITY_CHECK_FAILED', 1;
