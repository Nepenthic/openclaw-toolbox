$ErrorActionPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'

function Say($s){ Write-Output $s }

. "$PSScriptRoot\log.ps1" | Out-Null
Write-OpenClawEvent -Message "OpenClaw Doctor (lite) run" -Level INFO | Out-Null

Say "== OpenClaw Doctor (lite) =="
Say ("Time: " + (Get-Date -Format o))

# 1) Gateway listener
$gw = [bool](netstat -ano | Select-String -Pattern ':18789\s+.*LISTENING')
Say ("Gateway :18789 listening: {0}" -f $gw)

# 2) Node status via tool port (best-effort)
# (We avoid calling openclaw CLI here because it has been flaky in non-interactive runs.)

# 3) Env vars that often bite
$keys = @('BRAVE_API_KEY','DISCORD_BOT_TOKEN','OPENCLAW_STATE_DIR','OPENCLAW_LOAD_SHELL_ENV')

# 3b) Global .env presence
$globalEnvPath = "$env:USERPROFILE\\.openclaw\\.env"
Say ("Global .env present: {0} ({1})" -f (Test-Path $globalEnvPath), $globalEnvPath)
foreach($k in $keys){
  $u = [Environment]::GetEnvironmentVariable($k,'User')
  $m = [Environment]::GetEnvironmentVariable($k,'Machine')
  $p = [Environment]::GetEnvironmentVariable($k,'Process')
  $status = if($p){'process'} elseif($u){'user'} elseif($m){'machine'} else {'missing'}
  $len = if($p){$p.Length} elseif($u){$u.Length} elseif($m){$m.Length} else {0}
  Say ("Env {0}: {1} (len {2})" -f $k,$status,$len)
}

# 4) Scheduled tasks (existence + power flags)
$tasks = @('OpenClaw Gateway','OpenClaw Node')
foreach($t in $tasks){
  $out = (cmd /c "schtasks /Query /TN \"$t\" /FO LIST" 2>&1)
  if($LASTEXITCODE -ne 0){
    Say "Task ${t}: MISSING"
    continue
  }
  Say "Task ${t}: PRESENT"
  ($out | Select-String -Pattern 'Status:|Last Result:|Task To Run:|Power Management:|Run As User:' ) | ForEach-Object { Say $_ }
}

Say "== Suggested next action =="
if(-not $gw){
  Say "- Gateway not listening. Try: schtasks /Run /TN \"OpenClaw Gateway\""
} else {
  Say "- Gateway looks up. If tools still timeout, check node connectivity and logs."
}
