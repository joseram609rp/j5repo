param([Parameter(Mandatory=$true)][string]$ArchivePath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
 $result=@{}
 foreach($name in @('legacy_vehicles_curated.jsonl','legacy_work_orders.jsonl','legacy_mechanics.jsonl','quality_summary.json')) {
  $entries=@($zip.Entries | Where-Object FullName -eq $name)
  if($entries.Count -ne 1 -or $entries[0].Length -gt 40000000) { throw 'Invalid archive entry' }
  $reader=[IO.StreamReader]::new($entries[0].Open(),[Text.Encoding]::UTF8)
  try { $result[$name]=$reader.ReadToEnd() } finally { $reader.Dispose() }
 }
 [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
 $result | ConvertTo-Json -Compress
} finally { $zip.Dispose() }
