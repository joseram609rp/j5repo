ALTER TABLE dbo.Users ADD failed_login_attempts int NOT NULL CONSTRAINT DF_Users_FailedLogin DEFAULT 0, locked_until datetime2(3) NULL, last_login_attempt_id uniqueidentifier NULL;
EXEC(N'ALTER TABLE dbo.Users WITH CHECK ADD CONSTRAINT CK_Users_FailedLogin CHECK(failed_login_attempts>=0)');
-- Existing UNIQUE(username) remains authoritative. Enforce the canonical ASCII representation even under CI collation.
ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Username;
ALTER TABLE dbo.Users WITH CHECK ADD CONSTRAINT CK_Users_Username CHECK (
 DATALENGTH(username)=DATALENGTH(LTRIM(RTRIM(username))) AND LEN(username) BETWEEN 3 AND 64
 AND username COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^a-z0-9._-]%');
