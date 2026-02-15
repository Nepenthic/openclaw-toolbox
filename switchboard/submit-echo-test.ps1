$ErrorActionPreference='Stop'
$token = (Get-Content -LiteralPath "$PSScriptRoot\data\token.txt" -Raw).Trim()
$hdr = @{ Authorization = "Bearer $token" }
$body = @{ kind='echo'; input=@{ text='switchboard test' } } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3883/v1/jobs' -Headers $hdr -Body $body -ContentType 'application/json' | ConvertTo-Json -Depth 12
