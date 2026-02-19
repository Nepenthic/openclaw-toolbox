$ErrorActionPreference='Stop'

# Pick a likely LAN IP (fallback to known MSI IP)
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -like '192.168.*' -and $_.PrefixOrigin -ne 'WellKnown'
} | Select-Object -First 1).IPAddress

if (-not $ip) { $ip = '192.168.86.242' }

$env:CONTROL_CENTER_BIND = $ip
$env:CONTROL_CENTER_PORT = '3080'
$env:CONTROL_CENTER_ALLOWED_HOSTS = "localhost,127.0.0.1,$ip"

# Ensure the backend can find OpenClaw CLI even when PATH differs.
$cli = (Get-Command openclaw -ErrorAction Stop).Source
$env:OPENCLAW_CLI_PATH = $cli

Write-Host ("Binding Control Center to http://" + $ip + ":" + $env:CONTROL_CENTER_PORT)
Write-Host "Allowed hosts: $env:CONTROL_CENTER_ALLOWED_HOSTS"
Write-Host "OpenClaw CLI: $env:OPENCLAW_CLI_PATH"

Set-Location $PSScriptRoot
node .\src\server.js
