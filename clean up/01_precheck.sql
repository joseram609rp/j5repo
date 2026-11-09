-- Runner supplies the shared validation and snapshot batches. Read only.
EXEC sys.sp_executesql @validate, @triggerParams, @itemsTrigger, @ordersTrigger, @numberTrigger;
CREATE TABLE #Snapshot (
 schema_name sysname NOT NULL, table_name sysname NOT NULL, row_count varchar(20) NOT NULL,
 sha256 varchar(64) NOT NULL, fk_sha256 varchar(64) NOT NULL, PRIMARY KEY(schema_name, table_name)
);
EXEC sys.sp_executesql @snapshot,N'@lockTables bit',0;
SELECT schema_name,table_name,row_count,sha256,fk_sha256 FROM #Snapshot ORDER BY schema_name,table_name;
SELECT status,COUNT_BIG(*) AS row_count FROM dbo.Orders GROUP BY status ORDER BY status;
SELECT OBJECT_SCHEMA_NAME(f.parent_object_id) AS child_schema, OBJECT_NAME(f.parent_object_id) AS child_table,
 f.name,OBJECT_NAME(f.referenced_object_id) AS parent_table,f.delete_referential_action_desc
 FROM sys.foreign_keys f
 WHERE f.parent_object_id IN (OBJECT_ID('dbo.OrderItems'),OBJECT_ID('dbo.Orders'),OBJECT_ID('dbo.Vehicles'),OBJECT_ID('dbo.Customers'))
 OR f.referenced_object_id IN (OBJECT_ID('dbo.OrderItems'),OBJECT_ID('dbo.Orders'),OBJECT_ID('dbo.Vehicles'),OBJECT_ID('dbo.Customers'))
 ORDER BY child_schema,child_table,f.name;
