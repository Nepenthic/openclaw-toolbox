Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Native {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
'@
$vk = 0xB3
[Native]::keybd_event([byte]$vk,0,0,0)
[Native]::keybd_event([byte]$vk,0,2,0)
Write-Output 'PLAY_PAUSE_SENT'
