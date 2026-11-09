param(
 [ValidateSet('precheck','cleanup','postcheck')][string]$Mode='precheck',
 [Parameter(Mandatory)][string]$BaselinePath,
 [string]$EvidencePath,
 [switch]$ConfirmTestDataDelete
)
$ErrorActionPreference='Stop'
if ($Mode -eq 'cleanup' -and (-not $ConfirmTestDataDelete -or -not $EvidencePath)) {
 throw 'Cleanup requires -EvidencePath and -ConfirmTestDataDelete.'
}
if ($Mode -ne 'cleanup' -and ($EvidencePath -or $ConfirmTestDataDelete)) {
 throw 'Evidence and delete confirmation are only valid in cleanup mode.'
}
$BaselinePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($BaselinePath)
$taskArgs = @('--env-file-if-exists=../.env','node_modules/tsx/dist/cli.mjs','../clean up/run-cleanup.mts',$Mode,$BaselinePath)
if ($Mode -eq 'cleanup') {
 $taskArgs += @((Resolve-Path -LiteralPath $EvidencePath).Path,'--confirm-test-data-delete')
}
Push-Location (Join-Path $PSScriptRoot '../backend')
try {
 & node @taskArgs
 if ($LASTEXITCODE -ne 0) { throw 'J5 cleanup command failed.' }
} finally { Pop-Location }
