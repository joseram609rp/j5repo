param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArguments)
$ErrorActionPreference = 'Stop'
$installed = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($installed) { & $installed.Source @PnpmArguments; exit $LASTEXITCODE }
$bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
if (!(Test-Path -LiteralPath $bundled)) { throw 'Instala Node.js 22 LTS y pnpm 11.19.0 o agrega pnpm a PATH.' }
$nodeBin = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$pnpmBin = Split-Path -Parent $bundled
$env:PATH = "$nodeBin;$pnpmBin;$env:PATH"
& $bundled @PnpmArguments
exit $LASTEXITCODE
