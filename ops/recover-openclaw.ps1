$ErrorActionPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'

function Say($s){ Write-Output $s }

Say "== Recover OpenClaw =="
Say ("Time: " + (Get-Date -Format o))

# Run doctor-lite for diagnostics
$doctor = & "$PSScriptRoot\openclaw-doctor-lite.ps1" 2>&1
$doctor | ForEach-Object { Say $_ }

# Minimal machine-readable result line for regression checklist / automation
$gw = [bool]($doctor | Select-String -Pattern 'Gateway :18789 listening: True')

if($gw){
  Say 'RESULT: OK'
  exit 0
} else {
  Say 'RESULT: NOT_OK'
  Say 'NEXT: Gateway not listening; try: schtasks /Run /TN "OpenClaw Gateway"'
  exit 1
}
