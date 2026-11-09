-- Read-only comparison against the saved precheck after commit.
EXEC sys.sp_executesql @validate,@triggerParams,@itemsTrigger,@ordersTrigger,@numberTrigger;
CREATE TABLE #Snapshot (
 schema_name sysname NOT NULL, table_name sysname NOT NULL, row_count varchar(20) NOT NULL,
 sha256 varchar(64) NOT NULL, fk_sha256 varchar(64) NOT NULL, PRIMARY KEY(schema_name, table_name)
);
EXEC sys.sp_executesql @snapshot,N'@lockTables bit',0;
IF EXISTS (
 SELECT 1 FROM #Snapshot WHERE schema_name='dbo'
 AND table_name IN ('OrderItems','Orders','Vehicles','Customers') AND row_count<>'0'
)
 THROW 51109, 'TARGET_NOT_EMPTY', 1;
DECLARE @protected nvarchar(max) = (
 SELECT schema_name,table_name,row_count,sha256,fk_sha256 FROM #Snapshot
 WHERE NOT (schema_name='dbo' AND table_name IN ('OrderItems','Orders','Vehicles','Customers'))
 ORDER BY schema_name,table_name FOR JSON PATH
);
IF @baseline IS NULL OR @protected COLLATE Latin1_General_100_BIN2 <> @baseline COLLATE Latin1_General_100_BIN2
 THROW 51111, 'PROTECTED_DATA_CHANGED', 1;
SELECT schema_name,table_name,row_count,sha256,fk_sha256 FROM #Snapshot ORDER BY schema_name,table_name;
