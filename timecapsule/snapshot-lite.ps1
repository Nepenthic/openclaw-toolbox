$ErrorActionPreference='Continue'
$ProgressPreference='SilentlyContinue'

function Step($name, [scriptblock]$fn){
  try {
    "STEP: $name"
    $global:LASTEXITCODE = 0
    & $fn
    if($global:LASTEXITCODE -ne $null -and $global:LASTEXITCODE -ne 0){
      "WARN: $name exitcode=$global:LASTEXITCODE"
    }
  } catch {
    "ERR: $name :: $($_.Exception.Message)"
  }
}

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path (Join-Path $PSScriptRoot 'snapshots') $ts
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Step 'timestamp' { Get-Date -Format o | Out-File (Join-Path $outDir 'timestamp.txt') }
Step 'os' { Get-CimInstance Win32_OperatingSystem | Select Caption,Version,BuildNumber,OSArchitecture | Format-List | Out-File (Join-Path $outDir 'os.txt') }
Step 'gpu' { Get-CimInstance Win32_VideoController | Select Name,DriverVersion,AdapterRAM | Format-List | Out-File (Join-Path $outDir 'gpu.txt') }

Step 'task gateway' { schtasks /Query /TN 'OpenClaw Gateway' /FO LIST /V | Out-File (Join-Path $outDir 'task-openclaw-gateway.txt') }
Step 'task node' { schtasks /Query /TN 'OpenClaw Node' /FO LIST /V | Out-File (Join-Path $outDir 'task-openclaw-node.txt') }

Step 'path user' { [Environment]::GetEnvironmentVariable('Path','User') | Out-File (Join-Path $outDir 'path-user.txt') }
Step 'path machine' { [Environment]::GetEnvironmentVariable('Path','Machine') | Out-File (Join-Path $outDir 'path-machine.txt') }

# OpenClaw CLI calls are currently unreliable in non-interactive runs on this host.
# Snapshot focuses on OS/GPU/PATH/tasks, which are the critical rebuild ingredients.

"WROTE_SNAPSHOT_DIR: $outDir"
