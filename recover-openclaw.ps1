$ErrorActionPreference='SilentlyContinue'
. "$PSScriptRoot\ops\log.ps1" | Out-Null
. "$PSScriptRoot\ops\git-info.ps1" | Out-Null

$commit = Get-GitCommitShort
Write-OpenClawEvent -Message "recover-openclaw start commit=$commit" -Level INFO | Out-Null

function Has-Listener18789 {
  try {
    $l = netstat -ano | Select-String -Pattern ':18789\s+.*LISTENING'
    return [bool]$l
  } catch { return $false }
}

'=== RECOVER OPENCLAW (single-attempt) ==='
Get-Date -Format o

$before = Has-Listener18789
"LISTENING_BEFORE: $before"

if(-not $before){
  'ACTION: starting gateway (user-mode)'
  try { openclaw gateway start | Out-String | Write-Output } catch { "gateway start failed: $($_.Exception.Message)" }
  Start-Sleep -Seconds 2
}

# Always attempt node start once (safe even if already running)
'ACTION: starting node (user-mode)'
try {
  # Avoid hangs: bound execution time
  $job = Start-Job -ScriptBlock { openclaw node start | Out-String }
  if(Wait-Job $job -Timeout 15){ Receive-Job $job | Write-Output } else { 'node start timed out (>15s)' }
  Remove-Job $job -Force | Out-Null
} catch { "node start failed: $($_.Exception.Message)" }

Start-Sleep -Seconds 2

$after = Has-Listener18789
"LISTENING_AFTER: $after"

'CHECK: openclaw nodes status'
try { openclaw nodes status } catch { "nodes status failed: $($_.Exception.Message)" }

if($after){
  'RESULT: OK'
  Write-OpenClawEvent -Message "recover-openclaw RESULT=OK commit=$commit" -Level INFO | Out-Null
} else {
  'RESULT: FAIL'
  Write-OpenClawEvent -Message "recover-openclaw RESULT=FAIL commit=$commit" -Level ERROR | Out-Null
  exit 2
}
