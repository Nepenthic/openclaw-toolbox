$ErrorActionPreference='SilentlyContinue'

$dataDir = Join-Path $PSScriptRoot 'data'
$logPath = Join-Path $dataDir 'server.log'
$maxBytes = 5MB
$keep = 5

if(-not (Test-Path $logPath)){
  'NO_LOG'
  exit 0
}

$size = (Get-Item $logPath).Length
if($size -lt $maxBytes){
  "OK size=$size"
  exit 0
}

# Rotate: server.log -> server.log.1 -> ...
for($i=$keep; $i -ge 1; $i--){
  $src = "$logPath.$i"
  $dst = "$logPath." + ($i+1)
  if(Test-Path $src){
    if($i -eq $keep){ Remove-Item $src -Force -ErrorAction SilentlyContinue }
    else { Move-Item $src $dst -Force -ErrorAction SilentlyContinue }
  }
}

Move-Item $logPath "$logPath.1" -Force
New-Item -ItemType File -Path $logPath -Force | Out-Null
'ROTATED'
