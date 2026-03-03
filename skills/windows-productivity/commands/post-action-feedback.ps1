param(
  [Parameter(Mandatory=$true)][string]$Action,
  [Parameter(Mandatory=$true)][string]$Outcome,
  [string]$Details = ''
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$progressPath = Join-Path $root 'ops\progress.md'
$logModule = Join-Path $root 'ops\log.ps1'

$ts = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

# One-line, append-only format.
$detailsPart = if ([string]::IsNullOrWhiteSpace($Details)) { '' } else { " -- $Details" }
$line = "- $ts | $Action | $Outcome$detailsPart"

$progressDir = Split-Path -Parent $progressPath
New-Item -ItemType Directory -Force -Path $progressDir | Out-Null
Add-Content -Path $progressPath -Value $line

# Also emit an event log entry (best-effort).
if (Test-Path $logModule) {
  try {
    . $logModule
    if (Get-Command Write-OpenClawEvent -ErrorAction SilentlyContinue) {
      Write-OpenClawEvent -Level 'INFO' -Message "feedback: $Action => $Outcome $Details"
    }
  } catch {
    # don't fail feedback if logging fails
  }
}

Write-Output $line
