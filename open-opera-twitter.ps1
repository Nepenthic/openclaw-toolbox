$ErrorActionPreference='SilentlyContinue'
$paths = @(
  'C:\Users\Nepen\AppData\Local\Programs\Opera GX\launcher.exe',
  'C:\Users\Nepen\AppData\Local\Programs\Opera GX\opera.exe',
  'C:\Users\Nepen\AppData\Local\Programs\Opera GX\opera_gx.exe',
  'C:\Program Files\Opera GX\launcher.exe',
  'C:\Program Files (x86)\Opera GX\launcher.exe'
)

$p = $null
foreach($candidate in $paths){
  if(Test-Path -LiteralPath $candidate){ $p = $candidate; break }
}

if($p){
  "FOUND: $p"
  Start-Process -FilePath $p -ArgumentList 'https://twitter.com'
  'STARTED'
} else {
  'NOT_FOUND'
}
