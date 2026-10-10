-- Preserve all historical totals and references. No updates to existing business rows.
ALTER TABLE dbo.Orders ADD tax_rate decimal(4,2) NOT NULL CONSTRAINT DF_Orders_TaxRate DEFAULT 0 WITH VALUES;
EXEC(N'ALTER TABLE dbo.Orders WITH CHECK ADD CONSTRAINT CK_Orders_TaxRate CHECK(tax_rate IN (0,13));');
ALTER TABLE dbo.OrderItems ADD notes nvarchar(2000) NOT NULL CONSTRAINT DF_OrderItems_Notes DEFAULT N'' WITH VALUES;
EXEC(N'ALTER TABLE dbo.Orders WITH CHECK ADD CONSTRAINT CK_Orders_Billing CHECK(
 status<>''CLOSED'' OR tax_rate=0 OR (
 COALESCE(JSON_VALUE(draft_data,''$.paymentMethod''),'''') IN (''SINPE'',''CREDIT_CARD'',''DEBIT_CARD'',''CASH'',''BANK_TRANSFER'')
 AND COALESCE(JSON_VALUE(draft_data,''$.electronicInvoice''),'''') IN (''true'',''false'')));');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_Orders_Guard ON dbo.Orders AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted WHERE status<>''OPEN'') AND COALESCE(TRY_CONVERT(bit,SESSION_CONTEXT(N''j5_admin_mutation'')),0)<>1
   THROW 51001,''Closed or void orders require an explicit admin operation'',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON i.id=d.id WHERE (i.mechanic_id<>d.mechanic_id AND (d.status<>''OPEN'' OR i.status<>''OPEN'' OR COALESCE(TRY_CONVERT(bit,SESSION_CONTEXT(N''j5_mechanic_reassignment'')),0)<>1)) OR (d.status<>''OPEN'' AND ((d.customer_id IS NOT NULL AND (i.customer_id IS NULL OR i.customer_id<>d.customer_id)) OR (d.vehicle_id IS NOT NULL AND (i.vehicle_id IS NULL OR i.vehicle_id<>d.vehicle_id)))))
   THROW 51002,''Historical references and assigned mechanic are immutable'',1;
 IF EXISTS(SELECT 1 FROM inserted i WHERE i.total_amount<>(SELECT COALESCE(SUM(oi.price+ROUND(oi.price*b.tax_rate/100,2)),0) FROM dbo.OrderItems oi JOIN dbo.Orders b ON b.id=oi.order_id WHERE oi.order_id=i.id))
   THROW 51003,''Total must equal stored services'',1;
 IF EXISTS(SELECT 1 FROM inserted i WHERE i.status=''CLOSED'' AND (NOT EXISTS(SELECT 1 FROM dbo.OrderItems WHERE order_id=i.id) OR LEN(LTRIM(RTRIM(i.customer_name_snapshot)))=0 OR LEN(i.plate_snapshot)<>6 OR i.plate_snapshot COLLATE Latin1_General_100_BIN2 NOT LIKE ''[A-Z][A-Z][A-Z][0-9][0-9][0-9]''))
   THROW 51004,''Closing requires valid services and snapshots'',1;
END');

EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_OrderItems_Total ON dbo.OrderItems AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM dbo.Orders o JOIN (SELECT order_id FROM inserted UNION SELECT order_id FROM deleted) x ON x.order_id=o.id WHERE o.status<>''OPEN'')
   THROW 51005,''Services of closed or void orders are immutable; reopen first'',1;
 UPDATE o SET total_amount=(SELECT COALESCE(SUM(oi.price+ROUND(oi.price*b.tax_rate/100,2)),0) FROM dbo.OrderItems oi JOIN dbo.Orders b ON b.id=oi.order_id WHERE oi.order_id=o.id),updated_at=SYSUTCDATETIME()
 FROM dbo.Orders o JOIN (SELECT order_id FROM inserted UNION SELECT order_id FROM deleted) x ON x.order_id=o.id;
END');
