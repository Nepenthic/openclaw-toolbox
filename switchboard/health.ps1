$ErrorActionPreference='SilentlyContinue'
$dataDir = Join-Path $PSScriptRoot 'data'
$tokenPath = Join-Path $dataDir 'token.txt'
$pidPath = Join-Path $dataDir 'server.pid'

$token = $null
if(Test-Path $tokenPath){ $token = (Get-Content $tokenPath -Raw).Trim() }

$bind = $env:SWITCHBOARD_BIND; if(-not $bind){ $bind = '127.0.0.1' }
$port = $env:SWITCHBOARD_PORT; if(-not $port){ $port = '3883' }

$pid = $null
if(Test-Path $pidPath){ $pid = (Get-Content $pidPath -Raw).Trim() }

if($pid){ 'PID: ' + $pid } else { 'PID: none' }

try {
  if($pid){
    $p = Get-Process -Id ([int]$pid) -ErrorAction Stop
    'PROCESS: running'
  }
} catch { 'PROCESS: not running' }

try {
  $headers = @{}
  if($token){ $headers.Authorization = "Bearer $token" }
  $r = Invoke-RestMethod -Method Get -Uri "http://$bind`:$port/health" -Headers $headers -TimeoutSec 2
  'HEALTH: OK'
  $r | ConvertTo-Json -Depth 4
} catch {
  'HEALTH: FAIL'
  $_.Exception.Message
}
