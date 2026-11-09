-- Applied transactionally by the existing checksum migration runner. No dbo data changes.
IF SCHEMA_ID(N'legacy') IS NULL EXEC(N'CREATE SCHEMA legacy AUTHORIZATION dbo');
CREATE TABLE legacy.ImportBatches (
 archive_hash char(64) NOT NULL PRIMARY KEY,
 imported_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 vehicle_count int NOT NULL, work_order_count int NOT NULL, mechanic_count int NOT NULL
);
CREATE TABLE legacy.Vehicles (
 record_id varchar(100) NOT NULL PRIMARY KEY,
 archive_hash char(64) NOT NULL REFERENCES legacy.ImportBatches(archive_hash),
 payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
 plate AS CONVERT(nvarchar(100),JSON_VALUE(payload,'$.plate_normalized')) PERSISTED,
 customer_name AS CONVERT(nvarchar(300),JSON_VALUE(payload,'$.customer_name')) PERSISTED
);
CREATE INDEX IX_LegacyVehicles_Plate ON legacy.Vehicles(plate);
CREATE INDEX IX_LegacyVehicles_Customer ON legacy.Vehicles(customer_name);
CREATE TABLE legacy.WorkOrders (
 record_id varchar(100) NOT NULL PRIMARY KEY,
 archive_hash char(64) NOT NULL REFERENCES legacy.ImportBatches(archive_hash),
 payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
 plate AS CONVERT(nvarchar(100),JSON_VALUE(payload,'$.plate_normalized')) PERSISTED,
 work_date AS CONVERT(char(10),JSON_VALUE(payload,'$.work_date')) PERSISTED
);
CREATE INDEX IX_LegacyWorkOrders_Plate ON legacy.WorkOrders(plate,record_id);
CREATE INDEX IX_LegacyWorkOrders_Date ON legacy.WorkOrders(work_date,record_id);
CREATE TABLE legacy.Mechanics (
 record_id varchar(100) NOT NULL PRIMARY KEY,
 archive_hash char(64) NOT NULL REFERENCES legacy.ImportBatches(archive_hash),
 payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1)
);
CREATE TABLE legacy.ImportIssues (
 archive_hash char(64) NOT NULL REFERENCES legacy.ImportBatches(archive_hash),
 issue_key varchar(100) NOT NULL,
 payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
 PRIMARY KEY(archive_hash,issue_key)
);
IF DATABASE_PRINCIPAL_ID(N'legacy_reader') IS NULL CREATE ROLE legacy_reader;
GRANT SELECT ON SCHEMA::legacy TO legacy_reader;
DENY INSERT, UPDATE, DELETE, ALTER ON SCHEMA::legacy TO legacy_reader;
-- DBA must add the non-owner API identity to legacy_reader. Import with a separate identity.
