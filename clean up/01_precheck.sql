-- Read-only counts, no PII.
IF DB_NAME()<>'tallerj5' THROW 51100,'TARGET_MISMATCH',1;
SELECT SCHEMA_NAME(schema_id) AS schema_name,name FROM sys.tables WHERE is_ms_shipped=0 ORDER BY schema_name,name;
SELECT name FROM dbo.SchemaMigrations ORDER BY name;
SELECT 'Users ADMIN' AS table_name, COUNT_BIG(*) AS row_count FROM dbo.Users WHERE role='ADMIN'
UNION ALL SELECT 'Users non ADMIN',COUNT_BIG(*) FROM dbo.Users WHERE role<>'ADMIN'
UNION ALL SELECT 'Sessions',COUNT_BIG(*) FROM dbo.Sessions
UNION ALL SELECT 'IdempotencyRequests',COUNT_BIG(*) FROM dbo.IdempotencyRequests
UNION ALL SELECT 'AuditLogs',COUNT_BIG(*) FROM dbo.AuditLogs
UNION ALL SELECT 'OrderItems',COUNT_BIG(*) FROM dbo.OrderItems
UNION ALL SELECT 'Orders',COUNT_BIG(*) FROM dbo.Orders
UNION ALL SELECT 'Vehicles',COUNT_BIG(*) FROM dbo.Vehicles
UNION ALL SELECT 'Customers',COUNT_BIG(*) FROM dbo.Customers
UNION ALL SELECT 'SchemaMigrations',COUNT_BIG(*) FROM dbo.SchemaMigrations;
SELECT status,COUNT_BIG(*) AS row_count FROM dbo.Orders GROUP BY status;
SELECT name,CONVERT(varchar(30),current_value) AS current_value FROM sys.sequences WHERE object_id=OBJECT_ID('dbo.OrderNumber');
