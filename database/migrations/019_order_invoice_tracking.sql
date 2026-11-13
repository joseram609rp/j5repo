CREATE TABLE dbo.OrderInvoiceTracking (
  order_id uniqueidentifier NOT NULL CONSTRAINT PK_OrderInvoiceTracking PRIMARY KEY
    CONSTRAINT FK_OrderInvoiceTracking_Orders REFERENCES dbo.Orders(id),
  is_issued bit NOT NULL,
  version rowversion NOT NULL
);
