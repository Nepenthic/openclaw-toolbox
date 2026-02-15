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

  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);

  public const int KEYEVENTF_KEYUP = 0x0002;
  public const byte VK_LWIN = 0x5B;
  public const byte VK_SHIFT = 0x10;
  public const byte VK_LEFT = 0x25;

  public static string TitleOf(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }

  public static void PressComboLeft(){
    keybd_event(VK_LWIN, 0, 0, 0);
    keybd_event(VK_SHIFT, 0, 0, 0);
    keybd_event(VK_LEFT, 0, 0, 0);
    keybd_event(VK_LEFT, 0, KEYEVENTF_KEYUP, 0);
    keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
    keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
  }
}
'@

$targets = New-Object System.Collections.Generic.List[object]
[Win]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if(-not [Win]::IsWindowVisible($hWnd)){ return $true }
  $t = [Win]::TitleOf($hWnd)
  if([string]::IsNullOrWhiteSpace($t)){ return $true }
  if($t -like '* - Opera*' -or $t -like '*Opera*'){
    $targets.Add([pscustomobject]@{Handle=$hWnd; Title=$t}) | Out-Null
  }
  return $true
}, [IntPtr]::Zero) | Out-Null

if($targets.Count -eq 0){
  'NO_VISIBLE_OPERA_WINDOW_FOUND'
  exit 0
}

$win = $targets | Sort-Object { $_.Title.Length } -Descending | Select-Object -First 1
[Win]::SetForegroundWindow($win.Handle) | Out-Null
Start-Sleep -Milliseconds 200

[Win]::PressComboLeft()
"MOVED_LEFT: $($win.Title)"
