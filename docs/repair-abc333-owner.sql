-- Proposed targeted owner repair: ABC333 -> Anthony Ramirez (444444444).
-- Supersedes the earlier MDMDMD proposal, which was never executed.
-- Review only. @Apply=0 rolls back; use 1 only after explicit approval.
SET XACT_ABORT ON;
DECLARE @Apply bit=0;
IF DB_NAME()<>'tallerj5' THROW 51200,'TARGET_MISMATCH',1;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @Vehicle uniqueidentifier,@Owner uniqueidentifier,@Target uniqueidentifier;
 SELECT @Vehicle=id,@Owner=owner_id FROM dbo.Vehicles WITH(UPDLOCK,HOLDLOCK) WHERE plate_normalized='ABC333';
 SELECT @Target=id FROM dbo.Customers WITH(UPDLOCK,HOLDLOCK) WHERE id='58387A71-8E42-40BC-957D-D6B95E4E70FC' AND identification='444444444' AND full_name=N'Anthony Ramirez';
 IF @Vehicle IS NULL OR @Target IS NULL THROW 51201,'REPAIR_TARGET_MISSING',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.Orders WHERE id='2BC92C98-73E1-4C9E-A8B0-91793AC32077' AND vehicle_id=@Vehicle AND customer_id=@Target AND customer_name_snapshot=N'Anthony Ramirez' AND status='CLOSED') THROW 51201,'EXPECTED_ANTHONY_ORDER_MISSING',1;
 IF @Owner<>'F8EABFD0-665F-4D2A-B8BC-29C9B86FC1BE' AND @Owner<>@Target THROW 51202,'OWNER_CHANGED_REVIEW_REQUIRED',1;
 SELECT id,status,customer_id,customer_name_snapshot,plate_snapshot,draft_data,version INTO #HistoryBefore FROM dbo.Orders WHERE vehicle_id=@Vehicle;
 IF @Owner<>@Target BEGIN
  UPDATE dbo.Vehicles SET owner_id=@Target WHERE id=@Vehicle;
  INSERT dbo.AuditLogs(actor_id,action,entity_id) VALUES(NULL,'VEHICLE_OWNER_CORRECTED',@Vehicle);
 END;
 IF EXISTS(SELECT * FROM #HistoryBefore EXCEPT SELECT id,status,customer_id,customer_name_snapshot,plate_snapshot,draft_data,version FROM dbo.Orders WHERE vehicle_id=@Vehicle)
 OR EXISTS(SELECT id,status,customer_id,customer_name_snapshot,plate_snapshot,draft_data,version FROM dbo.Orders WHERE vehicle_id=@Vehicle EXCEPT SELECT * FROM #HistoryBefore) THROW 51203,'HISTORY_CHANGED',1;
 SELECT plate,owner_id FROM dbo.Vehicles WHERE id=@Vehicle;
 IF @Apply=1 COMMIT TRANSACTION; ELSE ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
