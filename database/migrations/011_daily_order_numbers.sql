-- Business date is Costa Rica (UTC-6); created_at remains UTC.
DROP INDEX UX_Orders_Display ON dbo.Orders;
ALTER TABLE dbo.Orders DROP COLUMN display_order_id;
ALTER TABLE dbo.Orders ADD order_date date NULL, daily_order_number bigint NULL;
EXEC(N'-- Existing CLOSED/VOID rows require the established explicit ADMIN mutation context.
EXEC sys.sp_set_session_context @key=N''j5_admin_mutation'',@value=1;
WITH numbered AS (
 SELECT id,CONVERT(date,DATEADD(hour,-6,created_at)) AS business_date,
 ROW_NUMBER() OVER(PARTITION BY CONVERT(date,DATEADD(hour,-6,created_at)) ORDER BY created_at,order_number) AS daily_number
 FROM dbo.Orders
)
UPDATE o SET order_date=n.business_date,daily_order_number=n.daily_number
FROM dbo.Orders o JOIN numbered n ON n.id=o.id;
EXEC sys.sp_set_session_context @key=N''j5_admin_mutation'',@value=NULL;
ALTER TABLE dbo.Orders ALTER COLUMN order_date date NOT NULL;
ALTER TABLE dbo.Orders ADD CONSTRAINT DF_Orders_Date DEFAULT CONVERT(date,DATEADD(hour,-6,SYSUTCDATETIME())) FOR order_date;
ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_DailyNumber CHECK(daily_order_number IS NULL OR daily_order_number>0);
ALTER TABLE dbo.Orders ADD display_order_id AS (''OT-''+CONVERT(char(8),order_date,112)+''-''+CASE WHEN daily_order_number<10 THEN ''0'' ELSE '''' END+CONVERT(varchar(20),daily_order_number)) PERSISTED;
CREATE UNIQUE INDEX UX_Orders_Daily ON dbo.Orders(order_date,daily_order_number) WHERE daily_order_number IS NOT NULL;
CREATE UNIQUE INDEX UX_Orders_Display ON dbo.Orders(display_order_id) WHERE daily_order_number IS NOT NULL;
');
-- Handles multi-row inserts too. Allocation rolls back with the enclosing transaction.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_Orders_DailyNumber ON dbo.Orders AFTER INSERT AS
BEGIN
 SET NOCOUNT ON;
 DECLARE @r int;
 EXEC @r=sys.sp_getapplock @Resource=N''j5:daily-orders'',@LockMode=''Exclusive'',@LockOwner=''Transaction'',@LockTimeout=4000;
 IF @r<0 THROW 51011,''Daily order allocation unavailable'',1;
 WITH numbered AS (
 SELECT i.id,i.order_date,
 ROW_NUMBER() OVER(PARTITION BY i.order_date ORDER BY i.created_at,i.order_number) AS n
 FROM inserted i WHERE i.daily_order_number IS NULL
 ), allocated AS (
 SELECT n.id,n.n+COALESCE((SELECT MAX(o.daily_order_number) FROM dbo.Orders o WHERE o.order_date=n.order_date),0) AS n
 FROM numbered n
 )
 UPDATE o SET daily_order_number=a.n FROM dbo.Orders o JOIN allocated a ON a.id=o.id;
END');
