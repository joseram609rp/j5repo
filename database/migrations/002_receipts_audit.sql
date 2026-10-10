CREATE TABLE dbo.IdempotencyRequests (
 user_id uniqueidentifier NOT NULL REFERENCES dbo.Users(id),
 idempotency_key uniqueidentifier NOT NULL,
 fingerprint char(64) NOT NULL,
 request_password_hash varchar(100) NULL,
 response_status int NOT NULL CONSTRAINT CK_Idempotency_Status CHECK(response_status BETWEEN 200 AND 599),
 response_body nvarchar(max) NOT NULL CONSTRAINT CK_Idempotency_Body CHECK(ISJSON(response_body)=1),
 response_headers nvarchar(max) NOT NULL CONSTRAINT CK_Idempotency_Headers CHECK(ISJSON(response_headers)=1),
 created_at datetime2(3) NOT NULL CONSTRAINT DF_Idempotency_Created DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_IdempotencyRequests PRIMARY KEY(user_id,idempotency_key)
);
CREATE TABLE dbo.AuditLogs (
 id bigint IDENTITY NOT NULL CONSTRAINT PK_AuditLogs PRIMARY KEY,
 actor_id uniqueidentifier NULL REFERENCES dbo.Users(id),
 action varchar(64) NOT NULL,
 entity_id uniqueidentifier NULL,
 created_at datetime2(3) NOT NULL CONSTRAINT DF_AuditLogs_Created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_AuditLogs_Actor ON dbo.AuditLogs(actor_id,created_at);
CREATE INDEX IX_AuditLogs_Entity ON dbo.AuditLogs(entity_id,created_at);
-- No automatic deletion of receipts: offline queues have no finite retention yet.
