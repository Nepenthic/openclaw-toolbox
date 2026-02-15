$ErrorActionPreference='SilentlyContinue'

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $PSScriptRoot "snapshots\$ts"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Out-File($name, $content){
  $path = Join-Path $outDir $name
  $content | Out-File -FilePath $path -Encoding UTF8
  return $path
}

# 1) System basics
$sys = [ordered]@{}
$sys.Timestamp = (Get-Date -Format o)
$sys.ComputerName = $env:COMPUTERNAME
$sys.UserName = $env:USERNAME
$sys.OS = (Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture)
$sys.BIOS = (Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion, Manufacturer, SerialNumber)
$sys.CPU = (Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
$sys.RAM_GB = [Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,2)
Out-File "system.json" ($sys | ConvertTo-Json -Depth 6)

# 2) GPU + driver
$gpus = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, PNPDeviceID
Out-File "gpu.json" ($gpus | ConvertTo-Json -Depth 4)

# 3) Disk info
$disks = Get-PhysicalDisk | Select FriendlyName, MediaType, Size, BusType | Sort FriendlyName
Out-File "disks.txt" ($disks | Format-Table -AutoSize | Out-String)

# 4) PATH (user + machine)
try {
  $userPath = [Environment]::GetEnvironmentVariable('Path','User')
  $machPath = [Environment]::GetEnvironmentVariable('Path','Machine')
  Out-File "path-user.txt" $userPath
  Out-File "path-machine.txt" $machPath
} catch {}

# 5) OpenClaw versions
$oc = @()
try { $oc += (openclaw --version 2>&1 | Out-String) } catch { $oc += "openclaw --version failed" }
try { $oc += (openclaw status 2>&1 | Out-String) } catch { $oc += "openclaw status failed" }
Out-File "openclaw.txt" ($oc -join "`n---`n")

# 6) Scheduled Tasks (best-effort)
$taskNames = @('OpenClaw Gateway','OpenClaw Node')
foreach($t in $taskNames){
  try {
    $xmlPath = Join-Path $outDir ("task-" + ($t -replace '\\s+','-') + ".xml")
    schtasks /Query /TN $t /XML | Out-File -FilePath $xmlPath -Encoding UTF8
  } catch {
    Out-File ("task-" + ($t -replace '\\s+','-') + "-ERROR.txt") "Could not export XML for task: $t"
  }
}

# 7) Installed apps inventory (best-effort)
# NOTE: winget and pnputil can take a while; we cap run time to keep things responsive.

# Basic uninstall keys snapshot (fast)
$uninst = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$apps = foreach($k in $uninst){
  Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } |
    Select-Object DisplayName, DisplayVersion, Publisher, InstallDate
}
$apps = $apps | Sort-Object DisplayName -Unique
Out-File "installed-apps.txt" ($apps | Format-Table -AutoSize | Out-String)

# winget list (optional, capped ~30s)
try {
  if(Get-Command winget -ErrorAction SilentlyContinue){
    $job = Start-Job -ScriptBlock { winget list }
    if(Wait-Job $job -Timeout 30){
      Receive-Job $job | Out-File -FilePath (Join-Path $outDir "winget-list.txt") -Encoding UTF8
    } else {
      Out-File "winget-list-ERROR.txt" 'winget list timed out after 30s'
    }
    Remove-Job $job -Force | Out-Null
  }
} catch {}

# 8) Driver list (optional, capped ~45s)
try {
  if(Get-Command pnputil.exe -ErrorAction SilentlyContinue){
    $job = Start-Job -ScriptBlock { pnputil /enum-drivers }
    if(Wait-Job $job -Timeout 45){
      Receive-Job $job | Out-File -FilePath (Join-Path $outDir "pnputil-drivers.txt") -Encoding UTF8
    } else {
      Out-File "pnputil-drivers-ERROR.txt" 'pnputil /enum-drivers timed out after 45s'
    }
    Remove-Job $job -Force | Out-Null
  }
} catch {}

# 9) Power settings summary
try {
  powercfg /getactivescheme | Out-File -FilePath (Join-Path $outDir "powercfg-active.txt") -Encoding UTF8
} catch {}

"WROTE_SNAPSHOT_DIR: $outDir"
