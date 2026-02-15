$ErrorActionPreference='SilentlyContinue'

'=== TIME ==='
Get-Date -Format o

'=== GATEWAY PROCESS (openclaw gateway --port 18789) ==='
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match 'openclaw' -and $_.CommandLine -match 'gateway' -and $_.CommandLine -match '--port 18789'
} | Select-Object ProcessId,CommandLine | Format-List

'=== LISTENERS :18789 ==='
try { netstat -ano | Select-String -Pattern ':18789\s+.*LISTENING' } catch {}

'=== CONNECTED TCP TO :18789 ==='
try { netstat -ano | Select-String -Pattern ':18789\s+.*ESTABLISHED' } catch {}

'=== OPENCLAW STATUS (best-effort) ==='
try { openclaw status } catch { "openclaw status failed: $($_.Exception.Message)" }

'=== NODES STATUS (best-effort) ==='
try { openclaw nodes status } catch { "openclaw nodes status failed: $($_.Exception.Message)" }

'=== LATEST LOG TAIL (best-effort) ==='
$logDirs = @('C:\\tmp\\openclaw', "$env:USERPROFILE\\.openclaw\\logs")
$logFile = $null
foreach($d in $logDirs){
  if(Test-Path $d){
    $cand = Get-ChildItem $d -Filter 'openclaw-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if($cand){ $logFile = $cand.FullName; break }
  }
}
if($logFile){
  "LOG: $logFile"
  try { Get-Content $logFile -Tail 120 } catch {}
} else {
  'NO_LOG_FOUND'
}
