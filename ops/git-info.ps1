$ErrorActionPreference='SilentlyContinue'

function Get-WorkspaceRoot {
  # ops/ is directly under workspace root
  return (Split-Path -Parent $PSScriptRoot)
}

function Get-GitCommitShort {
  $root = Get-WorkspaceRoot
  try {
    $c = (git -C $root rev-parse --short HEAD 2>$null)
    if($LASTEXITCODE -eq 0 -and $c){ return ($c | Select-Object -First 1).Trim() }
  } catch {}
  return 'nogit'
}

Export-ModuleMember -Function Get-GitCommitShort
