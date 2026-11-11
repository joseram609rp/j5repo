-- Historical work uses order_date while created_at and closed_at remain audit timestamps.
ALTER TABLE dbo.Orders ADD is_backfilled bit NOT NULL CONSTRAINT DF_Orders_IsBackfilled DEFAULT 0;
EXEC(N'ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_BackfillDate CHECK (
  is_backfilled=0 OR order_date < CONVERT(date,DATEADD(hour,-6,created_at))
)');
-- The existing AFTER INSERT allocator uses order_date for both kinds of orders.
