-- Phase 3: selections may be corrected while OPEN. Closed/void references and the assigned mechanic remain immutable.
-- Retains every authorization and total/service guard from 003; no data is changed.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_Orders_Guard ON dbo.Orders AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted WHERE status<>''OPEN'') AND COALESCE(TRY_CONVERT(bit,SESSION_CONTEXT(N''j5_admin_mutation'')),0)<>1
   THROW 51001,''Closed or void orders require an explicit admin operation'',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON i.id=d.id WHERE i.mechanic_id<>d.mechanic_id OR (d.status<>''OPEN'' AND ((d.customer_id IS NOT NULL AND (i.customer_id IS NULL OR i.customer_id<>d.customer_id)) OR (d.vehicle_id IS NOT NULL AND (i.vehicle_id IS NULL OR i.vehicle_id<>d.vehicle_id)))))
   THROW 51002,''Historical references and assigned mechanic are immutable'',1;
 IF EXISTS(SELECT 1 FROM inserted i WHERE i.total_amount<>(SELECT COALESCE(SUM(price),0) FROM dbo.OrderItems WHERE order_id=i.id))
   THROW 51003,''Total must equal stored services'',1;
 IF EXISTS(SELECT 1 FROM inserted i WHERE i.status=''CLOSED'' AND (NOT EXISTS(SELECT 1 FROM dbo.OrderItems WHERE order_id=i.id) OR LEN(LTRIM(RTRIM(i.customer_name_snapshot)))=0 OR LEN(i.plate_snapshot)<>6 OR i.plate_snapshot COLLATE Latin1_General_100_BIN2 NOT LIKE ''[A-Z][A-Z][A-Z][0-9][0-9][0-9]''))
   THROW 51004,''Closing requires valid services and snapshots'',1;
END');
CREATE INDEX IX_Orders_StatusCreated ON dbo.Orders(status,created_at DESC,order_number DESC);
