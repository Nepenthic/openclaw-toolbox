# ops/check-encoding.ps1
# Quick hygiene check: report likely encoding/line-ending issues in tracked text files.
# Non-destructive. Exit codes:
#   0 = OK (no issues found)
#   1 = issues found
#   2 = usage/error

[CmdletBinding()]
param(
  [string]$Path = ".",
  [switch]$All,              # include untracked files
  [switch]$VerboseReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-TextFilesFromGit {
  param([switch]$All)

  $files = @()
  if ($All) {
    # list all files under Path (best-effort), then filter to typical text extensions
    $files = Get-ChildItem -LiteralPath $Path -Recurse -File -Force | ForEach-Object { $_.FullName }
  } else {
    # tracked files only
    $root = (git rev-parse --show-toplevel 2>$null)
    if (-not $root) { throw "Not a git repo (or git not available)." }
    Push-Location $root
    try {
      $pathspec = $Path
      if ([string]::IsNullOrWhiteSpace($pathspec)) { $pathspec = '.' }

      # Limit to pathspec (so you can do -Path ops, -Path memory, etc.)
      $files = (git ls-files -- $pathspec) | ForEach-Object { Join-Path $root $_ }
    } finally {
      Pop-Location
    }
  }

  $textExt = @(
    '.md','.txt','.json','.yml','.yaml','.toml','.ini','.cfg',
    '.ps1','.psm1','.psd1','.js','.ts','.tsx','.jsx','.css','.html','.xml','.cs','.py','.rs','.go','.java','.sql'
  )

  return $files | Where-Object {
    $ext = [System.IO.Path]::GetExtension($_)
    $textExt -contains $ext
  }
}

function Test-FileLineEndings {
  param([string]$File)

  # Read raw bytes
  $bytes = [System.IO.File]::ReadAllBytes($File)

  # Skip empty
  if ($bytes.Length -eq 0) { return $null }

  # Detect UTF-8 BOM
  $hasUtf8Bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF

  # Heuristic: detect NULs (likely binary or UTF-16 without decoding)
  $nulCount = ($bytes | Where-Object { $_ -eq 0 }) | Measure-Object | Select-Object -ExpandProperty Count
  $hasNuls = $nulCount -gt 0

  # Count LF and CRLF sequences
  $lf = 0
  $crlf = 0
  for ($i=0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -eq 0x0A) { $lf++ }
    if ($i -gt 0 -and $bytes[$i-1] -eq 0x0D -and $bytes[$i] -eq 0x0A) { $crlf++ }
  }

  # If file has CR (0x0D) not followed by LF, count as suspicious (classic Mac/stray CR)
  $strayCr = 0
  for ($i=0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -eq 0x0D) {
      $nextIsLf = ($i+1 -lt $bytes.Length) -and $bytes[$i+1] -eq 0x0A
      if (-not $nextIsLf) { $strayCr++ }
    }
  }

  # Mixed endings: has at least one CRLF and at least one lone LF (LF count > CRLF count)
  $hasMixed = ($crlf -gt 0) -and (($lf - $crlf) -gt 0)

  return [pscustomobject]@{
    File = $File
    Utf8Bom = $hasUtf8Bom
    HasNuls = $hasNuls
    LfCount = $lf
    CrlfCount = $crlf
    StrayCrCount = $strayCr
    MixedLineEndings = $hasMixed
  }
}

try {
  $files = Get-TextFilesFromGit -All:$All
  if (-not $files -or $files.Count -eq 0) {
    Write-Host "No candidate text files found." -ForegroundColor Yellow
    exit 0
  }

  $issues = @()
  foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { continue }
    $r = Test-FileLineEndings -File $f
    if ($null -eq $r) { continue }

    $isIssue = $false
    $reasons = @()

    if ($r.HasNuls) { $isIssue = $true; $reasons += "contains NUL bytes (likely binary/UTF-16)" }
    if ($r.StrayCrCount -gt 0) { $isIssue = $true; $reasons += "has stray CR (\r) not part of CRLF" }
    if ($r.MixedLineEndings) { $isIssue = $true; $reasons += "mixed line endings (CRLF + LF)" }

    if ($isIssue -or $VerboseReport) {
      $issues += [pscustomobject]@{
        File = $r.File
        Issue = $isIssue
        Reasons = ($reasons -join '; ')
        Utf8Bom = $r.Utf8Bom
        LF = $r.LfCount
        CRLF = $r.CrlfCount
        StrayCR = $r.StrayCrCount
      }
    }
  }

  if (-not $issues -or $issues.Count -eq 0) {
    Write-Host "OK: no encoding/line-ending issues detected." -ForegroundColor Green
    exit 0
  }

  $bad = $issues | Where-Object { $_.Issue }
  if ($bad.Count -eq 0) {
    # Verbose report only
    $issues | Sort-Object File | Format-Table -AutoSize
    exit 0
  }

  Write-Host ("Found {0} file(s) with potential issues:" -f $bad.Count) -ForegroundColor Red
  $bad | Sort-Object File | Format-Table -AutoSize
  exit 1

} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 2
}
