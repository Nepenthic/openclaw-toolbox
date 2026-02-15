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
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);

  public static readonly IntPtr HWND_TOP = IntPtr.Zero;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint SWP_SHOWWINDOW = 0x0040;

  public const int KEYEVENTF_KEYUP = 0x0002;
  public const byte VK_F11 = 0x7A;

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public static string TitleOf(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }

  public static void TapF11(){
    keybd_event(VK_F11, 0, 0, 0);
    keybd_event(VK_F11, 0, KEYEVENTF_KEYUP, 0);
  }
}
'@

$screens = [System.Windows.Forms.Screen]::AllScreens
if($screens.Count -lt 2){
  'ONLY_ONE_MONITOR_DETECTED'
  exit 0
}

# Secondary = first non-primary screen (Windows definition)
$secondary = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1
$targetX = $secondary.WorkingArea.Left + 40
$targetY = $secondary.WorkingArea.Top + 40

# Find visible Opera window
$wins = New-Object System.Collections.Generic.List[object]
[Win]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if(-not [Win]::IsWindowVisible($hWnd)){ return $true }
  $t = [Win]::TitleOf($hWnd)
  if([string]::IsNullOrWhiteSpace($t)){ return $true }
  if($t -like '* - Opera*'){
    $rect = New-Object Win+RECT
    [void][Win]::GetWindowRect($hWnd, [ref]$rect)
    $wins.Add([pscustomobject]@{Handle=$hWnd; Title=$t; Left=$rect.Left; Top=$rect.Top}) | Out-Null
  }
  return $true
}, [IntPtr]::Zero) | Out-Null

if($wins.Count -eq 0){
  'NO_VISIBLE_OPERA_WINDOW_FOUND'
  exit 0
}

$w = $wins | Sort-Object { $_.Title.Length } -Descending | Select-Object -First 1

"MOVING: $($w.Title) -> secondary $($secondary.DeviceName) at ($targetX,$targetY)"
[void][Win]::SetWindowPos($w.Handle, [Win]::HWND_TOP, $targetX, $targetY, 0, 0, [Win]::SWP_NOSIZE -bor [Win]::SWP_NOZORDER -bor [Win]::SWP_SHOWWINDOW)
Start-Sleep -Milliseconds 200

[Win]::SetForegroundWindow($w.Handle) | Out-Null
Start-Sleep -Milliseconds 200
[Win]::TapF11()

$rect2 = New-Object Win+RECT
[void][Win]::GetWindowRect($w.Handle, [ref]$rect2)
"MOVED_TO: ($($rect2.Left),$($rect2.Top)) and sent F11"
