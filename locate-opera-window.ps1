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
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  public static readonly IntPtr HWND_TOP = IntPtr.Zero;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint SWP_SHOWWINDOW = 0x0040;

  public const int SW_RESTORE = 9;

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public static string TitleOf(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

$screens = [System.Windows.Forms.Screen]::AllScreens
'ALL_SCREENS:'
$screens | ForEach-Object { "Name=$($_.DeviceName) Primary=$($_.Primary) Bounds=$($_.Bounds) Working=$($_.WorkingArea)" }

$wins = New-Object System.Collections.Generic.List[object]
[Win]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  $t = [Win]::TitleOf($hWnd)
  if([string]::IsNullOrWhiteSpace($t)){ return $true }
  if($t -like '* - Opera*'){
    $rect = New-Object Win+RECT
    [void][Win]::GetWindowRect($hWnd, [ref]$rect)
    $vis = [Win]::IsWindowVisible($hWnd)
    $wins.Add([pscustomobject]@{Handle=$hWnd; Title=$t; Visible=$vis; Left=$rect.Left; Top=$rect.Top; Right=$rect.Right; Bottom=$rect.Bottom}) | Out-Null
  }
  return $true
}, [IntPtr]::Zero) | Out-Null

if($wins.Count -eq 0){
  'NO_OPERA_WINDOWS_FOUND'
  exit 0
}

'OPERA_WINDOWS:'
$wins | Sort-Object Left | Format-Table Visible,Left,Top,Right,Bottom,Title -AutoSize

# Force the right-most window back onto the primary monitor at (100,100)
$primary = $screens | Where-Object { $_.Primary } | Select-Object -First 1
$targetX = $primary.WorkingArea.Left + 100
$targetY = $primary.WorkingArea.Top + 100

$w = $wins | Sort-Object Left -Descending | Select-Object -First 1

[void][Win]::ShowWindow($w.Handle, [Win]::SW_RESTORE)
Start-Sleep -Milliseconds 150
[void][Win]::SetWindowPos($w.Handle, [Win]::HWND_TOP, $targetX, $targetY, 0, 0, [Win]::SWP_NOSIZE -bor [Win]::SWP_NOZORDER -bor [Win]::SWP_SHOWWINDOW)
Start-Sleep -Milliseconds 150
[void][Win]::SetForegroundWindow($w.Handle)

$rect2 = New-Object Win+RECT
[void][Win]::GetWindowRect($w.Handle, [ref]$rect2)
"RECOVERED_TO_PRIMARY: ($($rect2.Left),$($rect2.Top)) title=$($w.Title)"
