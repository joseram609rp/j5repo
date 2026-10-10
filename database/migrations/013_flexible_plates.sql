ALTER TABLE dbo.Vehicles DROP CONSTRAINT CK_Vehicles_Plate;
ALTER TABLE dbo.Vehicles WITH CHECK ADD CONSTRAINT CK_Vehicles_Plate CHECK (
 LEN(plate_normalized) BETWEEN 3 AND 12 AND plate_normalized COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9]%');
-- Preserve computed plate_normalized and UX_Vehicles_Plate.
