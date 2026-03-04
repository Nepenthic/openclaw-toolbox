$ErrorActionPreference='Stop'

# Pick a likely LAN IP (fallback to known MSI IP)
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -like '192.168.*' -and $_.PrefixOrigin -ne 'WellKnown'
} | Select-Object -First 1).IPAddress

if (-not $ip) { $ip = '192.168.86.242' }

$env:CONTROL_CENTER_BIND = $ip
$env:CONTROL_CENTER_PORT = '3080'
$env:CONTROL_CENTER_ALLOWED_HOSTS = "localhost,127.0.0.1,$ip"

# Allow read-only pages (Situation Room, read endpoints) to work without login on LAN.
# Write/admin actions still require login.
$env:CONTROL_CENTER_READONLY_PUBLIC = '1'

# Ensure the backend can find OpenClaw CLI even when PATH differs.
$cli = (Get-Command openclaw -ErrorAction Stop).Source
$env:OPENCLAW_CLI_PATH = $cli

# Provide the Gateway token to Control Center *without* hardcoding it into the repo.
# This enables nodes.run calls (e.g., K15 telemetry, Unreal jobs) from within ClawForge.
# Source of truth: C:\Users\Nepen\.openclaw\gateway.cmd (do not print or paste the token).
try {
  $gatewayCmd = Join-Path $env:USERPROFILE '.openclaw\gateway.cmd'
  if (Test-Path -LiteralPath $gatewayCmd) {
    $txt = Get-Content -LiteralPath $gatewayCmd -ErrorAction Stop
    $m = $txt | Select-String -Pattern '^\s*set\s+OPENCLAW_GATEWAY_TOKEN=(.+)\s*$' -AllMatches | Select-Object -First 1
    if ($m -and $m.Matches.Count -gt 0) {
      $token = $m.Matches[0].Groups[1].Value.Trim()
      if ($token) { $env:OPENCLAW_GATEWAY_TOKEN = $token }
    }
  }
} catch {
  # best-effort only
}

Write-Host ("Binding Control Center to http://" + $ip + ":" + $env:CONTROL_CENTER_PORT)
Write-Host "Allowed hosts: $env:CONTROL_CENTER_ALLOWED_HOSTS"
Write-Host "OpenClaw CLI: $env:OPENCLAW_CLI_PATH"
Write-Host ("Gateway token loaded: " + ($(if ($env:OPENCLAW_GATEWAY_TOKEN) { 'yes' } else { 'no' })))
Write-Host ("Incidents hook token present: " + ($(if ((Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.openclaw\\control-center\\secrets.json'))) { 'see secrets.json' } else { 'missing secrets.json' })))

Set-Location $PSScriptRoot
node .\src\server.js
