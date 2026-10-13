-- db:migrate executes this migration and its history entry in one transaction.
-- Preserve existing customers; drop only the constraints that depend on this column.
ALTER TABLE dbo.Customers DROP CONSTRAINT CK_Customers_Identification;
ALTER TABLE dbo.Customers DROP CONSTRAINT UQ_Customers_Identification;

ALTER TABLE dbo.Customers ALTER COLUMN identification varchar(10) NOT NULL;

ALTER TABLE dbo.Customers
 ADD CONSTRAINT UQ_Customers_Identification UNIQUE (identification);

-- DATALENGTH includes trailing spaces; BIN2 restricts the value to ASCII digits.
ALTER TABLE dbo.Customers WITH CHECK
 ADD CONSTRAINT CK_Customers_Identification CHECK (
  DATALENGTH(identification) IN (9,10)
  AND identification COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%'
 );
