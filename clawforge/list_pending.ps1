$pending = 'C:\Users\Nepen\.openclaw\control-center\jobs\pending'

# Always emit a JSON array (even when empty) so callers don't have to special-case.
# NOTE: Windows PowerShell's ConvertTo-Json emits *nothing* for an empty array.
if (!(Test-Path $pending)) {
  Write-Output '[]'
  exit 0
}

$limit = 2
if ($env:CLAWFORGE_PENDING_LIMIT) {
  [int]$limit = $env:CLAWFORGE_PENDING_LIMIT
  if ($limit -lt 1) { $limit = 1 }
}

$items = @(Get-ChildItem -Path $pending -Filter '*.json' -File |
  Sort-Object LastWriteTime |
  Select-Object -First $limit |
  Select-Object -ExpandProperty FullName)

if ($items.Count -eq 0) {
  Write-Output '[]'
} else {
  $items | ConvertTo-Json -Compress
}
