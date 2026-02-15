param(
  [Parameter(Mandatory=$true)][string]$InFile,
  [Parameter(Mandatory=$true)][string]$OutFile
)
$ErrorActionPreference='Stop'
. "$PSScriptRoot\_rules.ps1"

$text = Get-Content -LiteralPath $InFile -Raw

foreach($r in $Global:QuarantineRules){
  $text = [regex]::Replace($text, $r.Pattern, $r.Redact)
}

Set-Content -LiteralPath $OutFile -Value $text -Encoding UTF8
"WROTE: $OutFile"
