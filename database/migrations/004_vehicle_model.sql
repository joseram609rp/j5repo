-- Legacy vehicles retain an unknown model: never invent or backfill real data.
-- Empty installations can require the column immediately. Run under migration transaction.
IF NOT EXISTS (SELECT 1 FROM dbo.Vehicles WITH (TABLOCKX,HOLDLOCK))
    ALTER TABLE dbo.Vehicles ADD model nvarchar(100) NOT NULL;
ELSE
    ALTER TABLE dbo.Vehicles ADD model nvarchar(100) NULL;
-- Dynamic batch compiles after the column exists. NULL is allowed only for legacy records.
EXEC(N'ALTER TABLE dbo.Vehicles WITH CHECK ADD CONSTRAINT CK_Vehicles_Model
 CHECK (model IS NULL OR (LEN(LTRIM(RTRIM(model))) > 0 AND DATALENGTH(model) = DATALENGTH(LTRIM(RTRIM(model)))));');
