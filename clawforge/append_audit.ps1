param(
  # Default aligns with control-center's server-side audit log location.
  # (Local, append-only JSONL.)
  [string]$LogPath = (Join-Path $env:USERPROFILE '.openclaw\control-center\audit.log'),
  [Parameter(Mandatory=$true)][string]$Action,
  [string]$Actor = $env:USERNAME,
  [string]$Target,
  [ValidateSet('ok','error','skipped')][string]$Status = 'ok',
  [string]$Message,
  [hashtable]$Data,
  [int]$MaxRetries = 20,
  [int]$RetryDelayMs = 50
)

$dir = Split-Path -Parent $LogPath
if(!(Test-Path -LiteralPath $dir)){
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$evt = [ordered]@{
  ts = (Get-Date).ToString('o')
  event = $Action
  actor = $Actor
  target = $Target
  status = $Status
  message = $Message
  data = $Data
}

$line = ($evt | ConvertTo-Json -Compress -Depth 8)

for($i=0; $i -le $MaxRetries; $i++){
  try {
    $fs = [System.IO.File]::Open($LogPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    try {
      $sw = New-Object System.IO.StreamWriter($fs, [System.Text.UTF8Encoding]::new($false))
      try {
        $sw.WriteLine($line)
      } finally {
        $sw.Dispose()
      }
    } finally {
      $fs.Dispose()
    }
    exit 0
  } catch {
    if($i -ge $MaxRetries){
      Write-Error "append_audit: failed to write after $MaxRetries retries: $($_.Exception.Message)"
      exit 2
    }
    Start-Sleep -Milliseconds $RetryDelayMs
  }
}
