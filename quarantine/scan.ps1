param(
  [Parameter(Mandatory=$true)][string]$InFile
)
$ErrorActionPreference='Stop'
. "$PSScriptRoot\_rules.ps1"

$text = Get-Content -LiteralPath $InFile -Raw

$findings = New-Object System.Collections.Generic.List[object]

foreach($r in $Global:QuarantineRules){
  $m = [regex]::Matches($text, $r.Pattern)
  if($m.Count -gt 0){
    $findings.Add([pscustomobject]@{Type='secret-pattern'; Name=$r.Name; Hits=$m.Count}) | Out-Null
  }
}

foreach($f in $Global:InjectionFlags){
  if($text.ToLower().Contains($f)){
    $findings.Add([pscustomobject]@{Type='injection-flag'; Name=$f; Hits=1}) | Out-Null
  }
}

foreach($f in $Global:RiskyCommandFlags){
  if([regex]::IsMatch($text, $f, 'IgnoreCase')){
    $findings.Add([pscustomobject]@{Type='risky-command'; Name=$f; Hits=1}) | Out-Null
  }
}

if($findings.Count -eq 0){
  'OK: no obvious secrets/injection flags detected'
} else {
  'FINDINGS:'
  $findings | Sort-Object Type,Name | Format-Table -AutoSize
  'NOTE: this is heuristic. Always eyeball before sharing.'
}
