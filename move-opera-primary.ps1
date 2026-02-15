$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms

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
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  public static readonly IntPtr HWND_TOP = IntPtr.Zero;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint SWP_SHOWWINDOW = 0x0040;

  public const int SW_RESTORE = 9;

  public static string TitleOf(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

$screens = [System.Windows.Forms.Screen]::AllScreens
$primary = $screens | Where-Object { $_.Primary } | Select-Object -First 1
$targetX = $primary.WorkingArea.Left + 80
$targetY = $primary.WorkingArea.Top + 80

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
Start-Sleep -Milliseconds 120
[void][Win]::SetWindowPos($win.Handle, [Win]::HWND_TOP, $targetX, $targetY, 0, 0, [Win]::SWP_NOSIZE -bor [Win]::SWP_NOZORDER -bor [Win]::SWP_SHOWWINDOW)
Start-Sleep -Milliseconds 120
[void][Win]::SetForegroundWindow($win.Handle)

"MOVED_TO_PRIMARY: $($primary.DeviceName) @($targetX,$targetY) title=$($win.Title)"
