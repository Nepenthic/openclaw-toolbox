$ErrorActionPreference='SilentlyContinue'

# Close Opera GX gracefully by targeting the GX install path processes.
$gxRoot = 'C:\Users\Nepen\AppData\Local\Programs\Opera GX'

$procs = Get-Process -Name opera -ErrorAction SilentlyContinue | ForEach-Object {
  $p = $_
  $path = $null
  try { $path = $p.Path } catch {}
  [pscustomobject]@{ Id=$p.Id; MainWindowTitle=$p.MainWindowTitle; Path=$path }
} | Where-Object { $_.Path -and $_.Path.StartsWith($gxRoot, [System.StringComparison]::OrdinalIgnoreCase) }

if(-not $procs){
  'NO_OPERA_GX_PROCESSES_FOUND'
  return
}

$closed = @()
foreach($p in $procs){
  try {
    $gp = Get-Process -Id $p.Id -ErrorAction Stop
    if($gp.CloseMainWindow()){
      $closed += "CLOSE_SENT pid=$($p.Id) title=$($p.MainWindowTitle)"
    } else {
      $closed += "NO_WINDOW pid=$($p.Id)"
    }
  } catch {
    $closed += "ERR pid=$($p.Id) $($_.Exception.Message)"
  }
}

$closed
