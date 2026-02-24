param(
  [string]$StateDir,
  [string]$PendingDir,
  [int]$Max = 20,
  [switch]$PathsOnly
)

# Lists pending Control Center jobs in a human/JSON-friendly way.
# Defaults to the Control Center state dir: ~/.openclaw/control-center

if([string]::IsNullOrWhiteSpace($StateDir)){
  $home = $env:OPENCLAW_CONTROL_CENTER_STATE_DIR
  if([string]::IsNullOrWhiteSpace($home)){
    $home = Join-Path $env:USERPROFILE '.openclaw\\control-center'
  }
  $StateDir = $home
}

if([string]::IsNullOrWhiteSpace($PendingDir)){
  $PendingDir = Join-Path $StateDir 'jobs\\pending'
}

if(!(Test-Path -LiteralPath $PendingDir)){
  '[]'
  exit 0
}

$files = Get-ChildItem -LiteralPath $PendingDir -Filter '*.json' -File |
  Sort-Object LastWriteTime |
  Select-Object -First $Max

if($null -eq $files -or $files.Count -eq 0){
  '[]'
  exit 0
}

if($PathsOnly){
  ($files | Select-Object -ExpandProperty FullName) | ConvertTo-Json -Compress
  exit 0
}

$items = @()
foreach($f in $files){
  try {
    $txt = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop
    $j = $txt | ConvertFrom-Json -ErrorAction Stop

    $items += [pscustomobject]@{
      id        = $j.id
      type      = $j.type
      status    = $j.status
      createdAt = $j.createdAt
      updatedAt = $j.updatedAt
      attempts  = $j.attempts
      nodeId    = $j.nodeId
      file      = $f.Name
    }
  } catch {
    $items += [pscustomobject]@{ file = $f.Name; error = 'READ_OR_PARSE_FAILED' }
  }
}

$items | ConvertTo-Json -Compress
