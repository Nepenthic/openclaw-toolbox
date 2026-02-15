$ErrorActionPreference='SilentlyContinue'
$dataDir = Join-Path $PSScriptRoot 'data'
$pidPath = Join-Path $dataDir 'worker-echo.pid'
if(-not (Test-Path $pidPath)){ 'NO_PID_FILE'; exit 0 }
$pid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
if(-not $pid){ 'NO_PID'; exit 0 }
try { Stop-Process -Id ([int]$pid) -Force -ErrorAction Stop; "STOPPED pid=$pid" } catch { "NOT_RUNNING pid=$pid" }
