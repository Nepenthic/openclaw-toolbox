param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('MinimizeAll','FocusOpera','FullscreenOpera','MaximizeOpera','MoveOperaPrimary','MoveOperaSecondary')]
  [string]$Action,

  # Safety timeout for the action.
  [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = 'Stop'

if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 60) {
  throw 'TimeoutSeconds must be between 1 and 60.'
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path

$map = @{
  MinimizeAll        = Join-Path $root 'minimize-all.ps1'
  FocusOpera         = Join-Path $root 'focus-opera.ps1'
  FullscreenOpera    = Join-Path $root 'fullscreen-opera.ps1'
  MaximizeOpera      = Join-Path $root 'maximize-opera.ps1'
  MoveOperaPrimary   = Join-Path $root 'move-opera-primary.ps1'
  MoveOperaSecondary = Join-Path $root 'move-opera-secondary.ps1'
}

$scriptPath = $map[$Action]
if (-not (Test-Path $scriptPath)) {
  throw "Missing dependency for action '$Action': $scriptPath"
}

# Run the action in a child PowerShell process so we can apply a hard timeout.
$psiArgs = @(
  '-NoProfile',
  '-ExecutionPolicy','Bypass',
  '-File', $scriptPath
)

$proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $psiArgs -PassThru -WindowStyle Hidden

try {
  $proc | Wait-Process -Timeout $TimeoutSeconds
  if ($proc.ExitCode -ne 0) {
    throw "Action '$Action' failed with exit code $($proc.ExitCode)."
  }
  Write-Output "OK: $Action"
}
catch {
  try { if (-not $proc.HasExited) { $proc.Kill() } } catch {}
  throw
}
