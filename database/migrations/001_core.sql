-- Executed atomically by db:migrate. Existing objects are never dropped.
CREATE TABLE dbo.Users (
 id uniqueidentifier NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
 username nvarchar(64) COLLATE Latin1_General_100_CI_AS NOT NULL,
 password_hash varchar(100) NOT NULL,
 role varchar(8) NOT NULL CONSTRAINT CK_Users_Role CHECK (role IN ('ADMIN','MECHANIC')),
 active bit NOT NULL CONSTRAINT DF_Users_Active DEFAULT 1,
 created_at datetime2(3) NOT NULL CONSTRAINT DF_Users_Created DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_Users_Username UNIQUE(username),
 CONSTRAINT CK_Users_Username CHECK (LEN(username)>0 AND username=LOWER(LTRIM(RTRIM(username))))
);
CREATE TABLE dbo.Sessions (
 token_hash char(64) NOT NULL CONSTRAINT PK_Sessions PRIMARY KEY,
 user_id uniqueidentifier NOT NULL REFERENCES dbo.Users(id),
 csrf varchar(64) NOT NULL,
 created_at datetime2(3) NOT NULL CONSTRAINT DF_Sessions_Created DEFAULT SYSUTCDATETIME(),
 last_activity_at datetime2(3) NOT NULL,
 revoked_at datetime2(3) NULL
);
CREATE INDEX IX_Sessions_User ON dbo.Sessions(user_id) INCLUDE(revoked_at,last_activity_at);
CREATE INDEX IX_Sessions_Expiry ON dbo.Sessions(last_activity_at);
CREATE TABLE dbo.Customers (
 id uniqueidentifier NOT NULL CONSTRAINT PK_Customers PRIMARY KEY,
 name nvarchar(200) NOT NULL,
 national_id nvarchar(40) NULL,
 phone nvarchar(40) NULL,
 created_at datetime2(3) NOT NULL CONSTRAINT DF_Customers_Created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Customers_Name ON dbo.Customers(name);
CREATE TABLE dbo.Vehicles (
 id uniqueidentifier NOT NULL CONSTRAINT PK_Vehicles PRIMARY KEY,
 owner_id uniqueidentifier NULL REFERENCES dbo.Customers(id),
 plate nvarchar(20) NOT NULL,
 plate_normalized AS UPPER(REPLACE(REPLACE(LTRIM(RTRIM(plate)),N' ',N''),N'-',N'')) PERSISTED,
 CONSTRAINT CK_Vehicles_Plate CHECK (LEN(REPLACE(REPLACE(plate,N' ',N''),N'-',N''))>0)
);
CREATE UNIQUE INDEX UX_Vehicles_Plate ON dbo.Vehicles(plate_normalized);
CREATE INDEX IX_Vehicles_Owner ON dbo.Vehicles(owner_id);
CREATE TABLE dbo.Orders (
 id uniqueidentifier NOT NULL CONSTRAINT PK_Orders PRIMARY KEY,
 customer_id uniqueidentifier NULL REFERENCES dbo.Customers(id),
 vehicle_id uniqueidentifier NULL REFERENCES dbo.Vehicles(id),
 mechanic_id uniqueidentifier NOT NULL REFERENCES dbo.Users(id),
 status varchar(8) NOT NULL CONSTRAINT DF_Orders_Status DEFAULT 'OPEN'
   CONSTRAINT CK_Orders_Status CHECK(status IN ('OPEN','CLOSED','VOID')),
 customer_name_snapshot nvarchar(200) NOT NULL,
 plate_snapshot nvarchar(20) NOT NULL,
 mileage int NULL CONSTRAINT CK_Orders_Mileage CHECK(mileage BETWEEN 0 AND 10000000),
 notes nvarchar(max) NOT NULL,
 recommendations nvarchar(max) NOT NULL,
 total decimal(12,2) NOT NULL CONSTRAINT DF_Orders_Total DEFAULT 0 CONSTRAINT CK_Orders_Total CHECK(total>=0),
 created_at datetime2(3) NOT NULL CONSTRAINT DF_Orders_Created DEFAULT SYSUTCDATETIME(),
 updated_at datetime2(3) NOT NULL CONSTRAINT DF_Orders_Updated DEFAULT SYSUTCDATETIME(),
 version rowversion NOT NULL,
 CONSTRAINT CK_Orders_Close CHECK(status<>'CLOSED' OR (mileage IS NOT NULL AND customer_id IS NOT NULL AND vehicle_id IS NOT NULL))
);
CREATE INDEX IX_Orders_Customer ON dbo.Orders(customer_id,created_at);
CREATE INDEX IX_Orders_Vehicle ON dbo.Orders(vehicle_id,created_at);
CREATE INDEX IX_Orders_Mechanic ON dbo.Orders(mechanic_id,status);
CREATE TABLE dbo.OrderItems (
 id uniqueidentifier NOT NULL CONSTRAINT PK_OrderItems PRIMARY KEY,
 order_id uniqueidentifier NOT NULL REFERENCES dbo.Orders(id),
 description nvarchar(500) NOT NULL,
 quantity decimal(12,2) NOT NULL CONSTRAINT CK_OrderItems_Quantity CHECK(quantity>0),
 unit_price decimal(12,2) NOT NULL CONSTRAINT CK_OrderItems_Price CHECK(unit_price>=0)
);
CREATE INDEX IX_OrderItems_Order ON dbo.OrderItems(order_id);
