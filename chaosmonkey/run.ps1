param(
  [ValidateSet('observe','microstress')][string]$Mode = 'observe'
)

$ErrorActionPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $PSScriptRoot "reports\$ts"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function WriteFile($name, $text){
  $path = Join-Path $outDir $name
  $text | Out-File -FilePath $path -Encoding UTF8
}

function Snap($label){
  $o = @()
  $o += "== $label =="
  $o += "Time: " + (Get-Date -Format o)

  # gateway listener
  $listening = $false
  try { $listening = [bool](netstat -ano | Select-String -Pattern ':18789\s+.*LISTENING') } catch {}
  $o += "Gateway :18789 listening: $listening"

  # CPU/mem/disk quick stats
  try {
    $cpu = (Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples.CookedValue
    $o += ('CPU %: ' + [Math]::Round($cpu,1))
  } catch {}

  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $freeGB = [Math]::Round($os.FreePhysicalMemory/1MB,2)
    $totalGB = [Math]::Round($os.TotalVisibleMemorySize/1MB,2)
    $o += "RAM free/total GB: $freeGB / $totalGB"
  } catch {}

  try {
    $disk = Get-Counter '\\PhysicalDisk(_Total)\\% Disk Time'
    $dt = $disk.CounterSamples.CookedValue
    $o += ('Disk % time: ' + [Math]::Round($dt,1))
  } catch {}

  try {
    $tdr = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='nvlddmkm'; StartTime=(Get-Date).AddMinutes(-60)} -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -in 153,4101 } | Select-Object -First 5
    if($tdr){ $o += "Recent nvlddmkm (last 60m): yes" } else { $o += "Recent nvlddmkm (last 60m): no" }
  } catch {}

  return ($o -join "`n")
}

function MicroStressCPU {
  # bounded ~5s CPU tickle
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $x = 0
  while($sw.ElapsedMilliseconds -lt 5000){ $x = ($x + 1) % 1000003 }
  $sw.Stop()
  "CPU microstress done in ${($sw.ElapsedMilliseconds)}ms"
}

function MicroStressDisk {
  # bounded small read of a system file
  $path = "$env:WINDIR\\System32\\notepad.exe"
  if(Test-Path $path){
    $b = [IO.File]::ReadAllBytes($path)
    "Disk microstress read bytes: $($b.Length)"
  } else {
    'Disk microstress skipped (file missing)'
  }
}

function MicroStressNet {
  # bounded DNS resolve
  try {
    $h = [System.Net.Dns]::GetHostEntry('example.com')
    "Net microstress DNS OK: $($h.HostName)"
  } catch {
    'Net microstress DNS failed'
  }
}

# Observe baseline
WriteFile 'baseline.txt' (Snap 'baseline')

if($Mode -eq 'microstress'){
  # Hard-stop condition: if gateway not listening, do NOT stress.
  $gwOk = $false
  try { $gwOk = [bool](netstat -ano | Select-String -Pattern ':18789\s+.*LISTENING') } catch {}
  if(-not $gwOk){
    WriteFile 'microstress.txt' 'ABORT: gateway not healthy (listener missing)'
    WriteFile 'after.txt' (Snap 'after-abort')
    Write-Output "WROTE_REPORT_DIR: $outDir"
    exit 0
  }

  $log = @()
  $log += MicroStressCPU
  $log += MicroStressDisk
  $log += MicroStressNet
  WriteFile 'microstress.txt' ($log -join "`n")
}

WriteFile 'after.txt' (Snap 'after')
Write-Output "WROTE_REPORT_DIR: $outDir"
