-- Metadata only: preserve all orders, vehicles and applied migration files.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Orders') AND name=N'CK_Orders_ClosedNotes')
 ALTER TABLE dbo.Orders DROP CONSTRAINT CK_Orders_ClosedNotes;
ALTER TABLE dbo.Vehicles DROP CONSTRAINT CK_Vehicles_Year;
ALTER TABLE dbo.Vehicles WITH CHECK ADD CONSTRAINT CK_Vehicles_Year CHECK(year >= 1950);
