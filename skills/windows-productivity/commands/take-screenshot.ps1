param(
  # Output path for the screenshot PNG.
  [string]$OutPath
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$screenshotScript = Join-Path $root 'ops\screenshot.ps1'

if (-not (Test-Path $screenshotScript)) {
  throw "Missing dependency: $screenshotScript"
}

if ([string]::IsNullOrWhiteSpace($OutPath)) {
  & $screenshotScript
} else {
  & $screenshotScript -OutPath $OutPath
}
