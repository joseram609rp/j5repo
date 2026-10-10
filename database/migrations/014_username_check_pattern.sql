-- SQL LIKE bracket expressions require a literal hyphen at the beginning.
-- 012 is already applied; correct it additively without rewriting history.
ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Username;
ALTER TABLE dbo.Users WITH CHECK ADD CONSTRAINT CK_Users_Username CHECK (
 DATALENGTH(username)=DATALENGTH(LTRIM(RTRIM(username))) AND LEN(username) BETWEEN 3 AND 64
 AND username COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^-a-z0-9._]%');
