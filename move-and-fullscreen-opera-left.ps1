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
  public const uint SWP_NOACTIVATE = 0x0010;

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

# Identify monitors
$screens = [System.Windows.Forms.Screen]::AllScreens
$leftScreen = $screens | Sort-Object { $_.Bounds.Left } | Select-Object -First 1
$targetX = $leftScreen.WorkingArea.Left + 40
$targetY = $leftScreen.WorkingArea.Top + 40

# Enumerate visible Opera windows
$wins = New-Object System.Collections.Generic.List[object]
[Win]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if(-not [Win]::IsWindowVisible($hWnd)){ return $true }
  $t = [Win]::TitleOf($hWnd)
  if([string]::IsNullOrWhiteSpace($t)){ return $true }
  if($t -like '* - Opera*'){
    $rect = New-Object Win+RECT
    [void][Win]::GetWindowRect($hWnd, [ref]$rect)
    $wins.Add([pscustomobject]@{Handle=$hWnd; Title=$t; Left=$rect.Left; Top=$rect.Top; Right=$rect.Right; Bottom=$rect.Bottom}) | Out-Null
  }
  return $true
}, [IntPtr]::Zero) | Out-Null

if($wins.Count -eq 0){
  'NO_VISIBLE_OPERA_WINDOWS'
  exit 0
}

'OPERA_WINDOWS_FOUND:'
$wins | Sort-Object Left | Format-Table Left,Top,Right,Bottom,Title -AutoSize

# Choose right-most window (most likely currently on right monitor)
$w = $wins | Sort-Object Left -Descending | Select-Object -First 1

"TARGETING: $($w.Title) @($($w.Left),$($w.Top))"

# Move it to left monitor
[void][Win]::SetWindowPos($w.Handle, [Win]::HWND_TOP, $targetX, $targetY, 0, 0, [Win]::SWP_NOSIZE -bor [Win]::SWP_NOZORDER -bor [Win]::SWP_SHOWWINDOW)
Start-Sleep -Milliseconds 200

# Bring to front and fullscreen
[Win]::SetForegroundWindow($w.Handle) | Out-Null
Start-Sleep -Milliseconds 200
[Win]::TapF11()

# Report new rect
$rect2 = New-Object Win+RECT
[void][Win]::GetWindowRect($w.Handle, [ref]$rect2)
"MOVED_TO: ($($rect2.Left),$($rect2.Top)) on $($leftScreen.DeviceName) and sent F11"
