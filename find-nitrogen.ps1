$ErrorActionPreference='SilentlyContinue'

$SkipNames = @(
  'AppData','node_modules','.git','Microsoft','NVIDIA Corporation','Packages','Temp','tmp','ProgramData',
  'Windows','Program Files','Program Files (x86)'
)

function Find-Nitrogen {
  param(
    [Parameter(Mandatory=$true)][string]$Root,
    [int]$MaxDepth = 4,
    [int]$MaxHits = 20,
    [int]$MaxVisited = 20000
  )

  $hits = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path -LiteralPath $Root)) { return $hits }

  $stack = New-Object System.Collections.Generic.Stack[object]
  $stack.Push(@($Root, 0))
  $visited = 0

  while ($stack.Count -gt 0 -and $hits.Count -lt $MaxHits -and $visited -lt $MaxVisited) {
    $item  = $stack.Pop()
    $path  = [string]$item[0]
    $depth = [int]$item[1]
    $visited++

    if ([IO.Path]::GetFileName($path) -ieq 'nitrogen') {
      $hits.Add($path)
    }

    if ($depth -ge $MaxDepth) { continue }

    try {
      foreach ($d in [System.IO.Directory]::EnumerateDirectories($path)) {
        $name = [IO.Path]::GetFileName($d)
        if ($SkipNames -contains $name) { continue }
        $stack.Push(@($d, $depth + 1))
      }
    } catch {}
  }

  return $hits
}

$roots = @(
  'C:\Users\Nepen\Desktop',
  'C:\Users\Nepen\Downloads',
  'C:\Users\Nepen\Documents',
  'C:\Users\Nepen\source'
)

$all = New-Object System.Collections.Generic.List[string]
foreach ($r in $roots) {
  foreach ($f in (Find-Nitrogen -Root $r -MaxDepth 5 -MaxHits 50 -MaxVisited 30000)) {
    if (-not $all.Contains($f)) { $all.Add($f) }
  }
}

if ($all.Count -eq 0) {
  'NO_HITS_IN_COMMON_LOCATIONS'
} else {
  $all | Sort-Object
}
