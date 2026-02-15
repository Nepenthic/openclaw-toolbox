$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

$dataDir = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$tokenPath = Join-Path $dataDir 'token.txt'
$pidPath = Join-Path $dataDir 'worker-echo.pid'
$logOut = Join-Path $dataDir 'worker-echo.out.log'
$logErr = Join-Path $dataDir 'worker-echo.err.log'

if(-not (Test-Path $tokenPath)){
  throw 'NO_TOKEN (start server first)'
}
$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()

if(Test-Path $pidPath){
  $oldPid = (Get-Content $pidPath -Raw).Trim()
  if($oldPid){
    try { Get-Process -Id ([int]$oldPid) -ErrorAction Stop | Out-Null; Write-Output "ALREADY_RUNNING pid=$oldPid"; exit 0 } catch {}
  }
}

$bind = $env:SWITCHBOARD_BIND; if(-not $bind){ $bind = '127.0.0.1' }
$port = $env:SWITCHBOARD_PORT; if(-not $port){ $port = '3883' }
$url = "http://$bind`:$port"

$env:SWITCHBOARD_TOKEN = $token
$env:SWITCHBOARD_URL = $url
$env:SWITCHBOARD_WORKER_ID = 'MSI-echo'
$env:SWITCHBOARD_TAGS = 'echo,windows,msi'

$node = (Get-Command node).Source
$workerPath = Join-Path $PSScriptRoot 'worker-echo.mjs'
$root = Split-Path -Parent $PSScriptRoot

$p = Start-Process -FilePath $node -ArgumentList @($workerPath) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
Set-Content -LiteralPath $pidPath -Value $p.Id -Encoding ASCII
Write-Output "STARTED pid=$($p.Id) url=$url out=$logOut err=$logErr"
