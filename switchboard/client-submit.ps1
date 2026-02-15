param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Token,
  [Parameter(Mandatory=$true)][string]$Kind,
  [Parameter()][string]$Prompt,
  [Parameter()][string]$Model,
  [string[]]$TagsAny = @(),
  [string[]]$TagsAll = @()
)

$headers = @{ Authorization = "Bearer $Token" }
$body = @{ kind = $Kind; input = @{}; requirements = @{} }
if($Prompt){ $body.input.prompt = $Prompt }
if($Model){ $body.input.model = $Model }
if($TagsAny.Count -gt 0){ $body.requirements.tagsAny = $TagsAny }
if($TagsAll.Count -gt 0){ $body.requirements.tagsAll = $TagsAll }

Invoke-RestMethod -Method Post -Uri "$Url/v1/jobs" -Headers $headers -Body ($body | ConvertTo-Json -Depth 6) -ContentType 'application/json'
