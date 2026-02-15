$ErrorActionPreference='SilentlyContinue'

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
try { openclaw node start | Out-String | Write-Output } catch { "node start failed: $($_.Exception.Message)" }

Start-Sleep -Seconds 2

$after = Has-Listener18789
"LISTENING_AFTER: $after"

'CHECK: openclaw nodes status'
try { openclaw nodes status } catch { "nodes status failed: $($_.Exception.Message)" }

if($after){
  'RESULT: OK'
} else {
  'RESULT: FAIL'
  exit 2
}
