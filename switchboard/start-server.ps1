$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$tokenPath = Join-Path $dataDir 'token.txt'
$pidPath = Join-Path $dataDir 'server.pid'
$logOut = Join-Path $dataDir 'server.out.log'
$logErr = Join-Path $dataDir 'server.err.log'

if(-not (Test-Path $tokenPath)){
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]',''
  Set-Content -LiteralPath $tokenPath -Value $token -Encoding ASCII
}

$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
if($token.Length -lt 16){ throw "Token too short in $tokenPath" }

# If existing PID alive, don't restart
if(Test-Path $pidPath){
  $oldPid = (Get-Content $pidPath -Raw).Trim()
  if($oldPid){
    try { Get-Process -Id ([int]$oldPid) -ErrorAction Stop | Out-Null; Write-Output "ALREADY_RUNNING pid=$oldPid"; exit 0 } catch {}
  }
}

$bind = $env:SWITCHBOARD_BIND; if(-not $bind){ $bind = '127.0.0.1' }
$port = $env:SWITCHBOARD_PORT; if(-not $port){ $port = '3883' }

$env:SWITCHBOARD_TOKEN = $token
$env:SWITCHBOARD_BIND = $bind
$env:SWITCHBOARD_PORT = $port

$node = (Get-Command node).Source
$serverPath = Join-Path $PSScriptRoot 'server.mjs'

# Start node in background (detached)
$p = Start-Process -FilePath $node -ArgumentList @($serverPath) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr

Set-Content -LiteralPath $pidPath -Value $p.Id -Encoding ASCII
Write-Output "STARTED pid=$($p.Id) bind=$bind port=$port tokenPath=$tokenPath out=$logOut err=$logErr"
