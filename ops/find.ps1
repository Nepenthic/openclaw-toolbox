<#
.SYNOPSIS
  Lightweight ripgrep-ish search for this Windows workspace.
.DESCRIPTION
  Recursively searches text files under the workspace for a pattern.
  Intended as a zero-dependency alternative when `rg` isn't installed.

.EXAMPLE
  .\ops\find.ps1 ai-digest

.EXAMPLE
  .\ops\find.ps1 "sessionTarget: isolated" -Path .\ops
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$Pattern,

  [Parameter(Position=1)]
  [string]$Path = ".",

  [switch]$Simple,

  [int]$Context = 0
)

$ErrorActionPreference = 'Stop'

$ssParams = @{
  Path = $Path
  Recurse = $true
  Pattern = $Pattern
}
if ($Simple) { $ssParams['SimpleMatch'] = $true }
if ($Context -gt 0) {
  $ssParams['Context'] = $Context
}

try {
  Select-String @ssParams |
    Sort-Object Path, LineNumber |
    ForEach-Object {
      $p = $_.Path
      $ln = $_.LineNumber
      $line = $_.Line.TrimEnd()
      "${p}:${ln}: ${line}"
    }
}
catch {
  Write-Error $_
  exit 1
}
