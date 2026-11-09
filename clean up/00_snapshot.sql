-- Internal batch. One hash per row, then hash the sorted list, including duplicates.
-- Only hashes and counts leave SQL Server. No row contents are returned.
DECLARE @schema sysname, @table sysname, @command nvarchar(max), @count bigint, @hash varchar(64), @metadata varchar(64), @id int;
DECLARE tables CURSOR LOCAL FAST_FORWARD FOR
 SELECT SCHEMA_NAME(schema_id),name FROM sys.tables WHERE is_ms_shipped=0 ORDER BY 1,2;
OPEN tables;
FETCH NEXT FROM tables INTO @schema,@table;
WHILE @@FETCH_STATUS=0
BEGIN
 -- Materialize row hashes so FOR JSON and the ordered aggregate compile separately.
 SET @command=N'CREATE TABLE #RowHashes (row_hash varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL);
   INSERT #RowHashes (row_hash)
   SELECT CONVERT(varchar(64), HASHBYTES(''SHA2_256'',
     (SELECT t.* FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER)),2)
   FROM '+QUOTENAME(@schema)+N'.'+QUOTENAME(@table)+N' AS t'
   +CASE WHEN @lockTables=1 THEN N' WITH (TABLOCKX,HOLDLOCK)' ELSE N'' END+N';
   SELECT @count=COUNT_BIG(*), @hash=CONVERT(varchar(64),
    HASHBYTES(''SHA2_256'',COALESCE(STRING_AGG(CONVERT(varchar(max),row_hash),'''')
      WITHIN GROUP (ORDER BY row_hash),'''')),2)
   FROM #RowHashes;';
 EXEC sys.sp_executesql @command,N'@count bigint OUTPUT,@hash varchar(64) OUTPUT',@count OUTPUT,@hash OUTPUT;
 SET @id=OBJECT_ID(QUOTENAME(@schema)+N'.'+QUOTENAME(@table),'U');
 SET @metadata=CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE((
  SELECT f.object_id, f.name, f.parent_object_id, f.referenced_object_id,
   f.delete_referential_action, f.update_referential_action, f.is_disabled, f.is_not_trusted,
   fc.constraint_column_id,fc.parent_column_id,fc.referenced_column_id
  FROM sys.foreign_keys f JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id
  WHERE f.parent_object_id=@id OR f.referenced_object_id=@id
  ORDER BY f.object_id,fc.constraint_column_id FOR JSON PATH
 ),N'[]')),2);
 INSERT #Snapshot VALUES (@schema,@table,CONVERT(varchar(20),@count),@hash,@metadata);
 FETCH NEXT FROM tables INTO @schema,@table;
END;
CLOSE tables;
DEALLOCATE tables;
