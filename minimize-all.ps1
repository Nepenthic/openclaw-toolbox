$ErrorActionPreference='SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Shell {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  public const uint WM_COMMAND = 0x0111;
  public const int MIN_ALL = 419;
}
'@

$h = [Shell]::FindWindow("Shell_TrayWnd", $null)
if($h -eq [IntPtr]::Zero){
  'TASKBAR_NOT_FOUND'
  exit 0
}
[void][Shell]::SendMessage($h, [Shell]::WM_COMMAND, [IntPtr][Shell]::MIN_ALL, [IntPtr]::Zero)
'MINIMIZED_ALL'
