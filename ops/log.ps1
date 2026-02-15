$ErrorActionPreference='SilentlyContinue'

function Write-OpenClawEvent {
  param(
    [Parameter(Mandatory=$true)][string]$Message,
    [ValidateSet('INFO','WARN','ERROR')][string]$Level='INFO'
  )

  $root = Split-Path -Parent $PSScriptRoot
  $logDir = Join-Path $root 'logs'
  $runsDir = Join-Path $logDir 'runs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  New-Item -ItemType Directory -Force -Path $runsDir | Out-Null

  $ts = (Get-Date -Format o)
  $line = "$ts [$Level] $Message"

  $eventsPath = Join-Path $logDir 'events.log'
  Add-Content -Path $eventsPath -Value $line

  # Also echo to stdout for immediate visibility
  Write-Output $line
}

Export-ModuleMember -Function Write-OpenClawEvent
