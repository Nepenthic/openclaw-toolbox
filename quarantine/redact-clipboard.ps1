$ErrorActionPreference='Stop'
. "$PSScriptRoot\_rules.ps1"

Add-Type -AssemblyName PresentationCore

$text = [Windows.Clipboard]::GetText()
if([string]::IsNullOrWhiteSpace($text)){
  'CLIPBOARD_EMPTY'
  exit 0
}

foreach($r in $Global:QuarantineRules){
  $text = [regex]::Replace($text, $r.Pattern, $r.Redact)
}

[Windows.Clipboard]::SetText($text)
'CLIPBOARD_REDACTED'
