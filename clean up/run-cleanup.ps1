param([ValidateSet('precheck','cleanup','postcheck')][string]$Mode='precheck',[switch]$ConfirmDeleteAllQA)
$ErrorActionPreference='Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
 if ($Mode -eq 'cleanup' -and -not $ConfirmDeleteAllQA) { throw 'Use -ConfirmDeleteAllQA explicitly.' }
 $taskArgs=@('node_modules/tsx/dist/cli.mjs','--env-file-if-exists=../.env','../clean up/run-cleanup.mts',$Mode)
 if ($ConfirmDeleteAllQA) { $taskArgs+='--confirm-delete-all-qa' }
 Push-Location 'backend'
 try { & node @taskArgs; if ($LASTEXITCODE -ne 0) { throw 'Cleanup command failed.' } } finally { Pop-Location }
} finally { Pop-Location }

