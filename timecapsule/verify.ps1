$ErrorActionPreference='SilentlyContinue'

function Flag($name,$ok,$detail=''){
  [pscustomobject]@{Check=$name; OK=$ok; Detail=$detail}
}

$results = New-Object System.Collections.Generic.List[object]

# Gateway listener
try {
  $listening = [bool](netstat -ano | Select-String -Pattern ':18789\s+.*LISTENING')
  $results.Add((Flag 'gateway:18789 listening' $listening)) | Out-Null
} catch { $results.Add((Flag 'gateway:18789 listening' $false $_.Exception.Message)) | Out-Null }

# nodes status is omitted here (CLI has been unreliable in non-interactive runs). Use openclaw-health.ps1 when needed.
# PATH sanity flags
try {
  $userPath = [Environment]::GetEnvironmentVariable('Path','User')
  $machPath = [Environment]::GetEnvironmentVariable('Path','Machine')
  $bad = @('Roaming pm','Program Files odejs')
  foreach($b in $bad){
    $hit = ($userPath -like "*$b*") -or ($machPath -like "*$b*")
    $results.Add((Flag ("PATH contains: " + $b) (-not $hit))) | Out-Null
  }
} catch {}

$results | Format-Table -AutoSize
