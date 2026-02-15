$ErrorActionPreference='SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class Win {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  public const int SW_RESTORE = 9;

  public static string TitleOf(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

$targets = New-Object System.Collections.Generic.List[object]
[Win]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if(-not [Win]::IsWindowVisible($hWnd)){ return $true }
  $t = [Win]::TitleOf($hWnd)
  if([string]::IsNullOrWhiteSpace($t)){ return $true }
  if($t -like '* - Opera*'){
    $targets.Add([pscustomobject]@{Handle=$hWnd; Title=$t}) | Out-Null
  }
  return $true
}, [IntPtr]::Zero) | Out-Null

if($targets.Count -eq 0){
  'NO_VISIBLE_OPERA_WINDOW_FOUND'
  exit 0
}

$win = $targets | Sort-Object { $_.Title.Length } -Descending | Select-Object -First 1
[void][Win]::ShowWindow($win.Handle, [Win]::SW_RESTORE)
Start-Sleep -Milliseconds 150
[Win]::SetForegroundWindow($win.Handle) | Out-Null
"FOCUSED: $($win.Title)"
