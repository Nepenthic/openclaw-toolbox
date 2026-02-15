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

  public static readonly IntPtr HWND_TOP = IntPtr.Zero;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint SWP_NOACTIVATE = 0x0010;

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public static string TitleOf(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

# Pick left-most monitor
$screens = [System.Windows.Forms.Screen]::AllScreens
$leftScreen = $screens | Sort-Object { $_.Bounds.Left } | Select-Object -First 1
$targetX = $leftScreen.WorkingArea.Left + 40
$targetY = $leftScreen.WorkingArea.Top + 40

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
  'NO_VISIBLE_OPERA_WINDOWS'
  exit 0
}

# Choose the Opera window that's currently farthest to the right (most likely the one you want to move back)
$w = $wins | Sort-Object Left -Descending | Select-Object -First 1

# Move (position only)
[void][Win]::SetWindowPos($w.Handle, [Win]::HWND_TOP, $targetX, $targetY, 0, 0, [Win]::SWP_NOSIZE -bor [Win]::SWP_NOZORDER -bor [Win]::SWP_NOACTIVATE)
"MOVED_BY_POS: $($w.Title) -> ($targetX,$targetY) on $($leftScreen.DeviceName)"
