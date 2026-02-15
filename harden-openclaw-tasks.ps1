$ErrorActionPreference='Stop'

function Harden-Task {
  param([string]$Name)
  $t = Get-ScheduledTask -TaskName $Name -ErrorAction Stop
  $s = $t.Settings

  # Harden settings
  $newSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

  # Preserve other settings that may matter
  $newSettings.ExecutionTimeLimit = $s.ExecutionTimeLimit
  $newSettings.DisallowStartIfOnBatteries = $false
  $newSettings.StopIfGoingOnBatteries = $false

  Set-ScheduledTask -TaskName $Name -Settings $newSettings | Out-Null

  # Return summary
  $t2 = Get-ScheduledTask -TaskName $Name
  $i2 = Get-ScheduledTaskInfo -TaskName $Name
  [pscustomobject]@{
    Task = $Name
    State = $i2.State
    LastTaskResult = $i2.LastTaskResult
    NextRunTime = $i2.NextRunTime
    AllowStartIfOnBatteries = $t2.Settings.AllowStartIfOnBatteries
    DontStopIfGoingOnBatteries = $t2.Settings.DontStopIfGoingOnBatteries
    RestartCount = $t2.Settings.RestartCount
    RestartInterval = $t2.Settings.RestartInterval
    MultipleInstances = $t2.Settings.MultipleInstances
  }
}

function Ensure-NodeTask {
  # If OpenClaw Node task is missing, create it to run node.cmd at logon (current user)
  $name = 'OpenClaw Node'
  $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if($existing){
    return 'NODE_TASK_EXISTS'
  }

  $nodeCmd = 'C:\Users\Nepen\.openclaw\node.cmd'
  if(-not (Test-Path -LiteralPath $nodeCmd)){
    throw "node.cmd not found at $nodeCmd"
  }

  $action = New-ScheduledTaskAction -Execute $nodeCmd -WorkingDirectory 'C:\Users\Nepen\.openclaw'
  $trigger = New-ScheduledTaskTrigger -AtLogOn

  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -User $env:USERNAME -RunLevel Limited -Force | Out-Null
  return 'NODE_TASK_CREATED'
}

$results = New-Object System.Collections.Generic.List[object]

# Ensure Node task exists (best-effort)
try { $results.Add((Ensure-NodeTask)) | Out-Null } catch { $results.Add("NODE_TASK_CREATE_FAILED: $($_.Exception.Message)") | Out-Null }

foreach($taskName in @('OpenClaw Gateway','OpenClaw Node')){
  try {
    $results.Add((Harden-Task -Name $taskName)) | Out-Null
  } catch {
    $results.Add([pscustomobject]@{ Task=$taskName; Error=$_.Exception.Message }) | Out-Null
  }
}

$results | Format-List
