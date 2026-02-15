param([Parameter(Mandatory=$true)][string]$Id)
$ErrorActionPreference='Stop'
$token = (Get-Content -LiteralPath "$PSScriptRoot\data\token.txt" -Raw).Trim()
$hdr = @{ Authorization = "Bearer $token" }
$r = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3883/v1/jobs/$Id" -Headers $hdr
$r | ConvertTo-Json -Depth 12
