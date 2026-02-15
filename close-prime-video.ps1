$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class Win {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

  public const uint WM_CLOSE = 0x0010;

  public static string TitleOf(IntPtr hWnd) {
    int len = GetWindowTextLength(hWnd);
    if(len <= 0) return "";
    var sb = new StringBuilder(len + 1);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

$patterns = @(
  'Prime Video',
  'Amazon Prime Video',
  'primevideo',
  'amazon.com',
  'PrimeVideo'
)

$closed = New-Object System.Collections.Generic.List[string]

[Win]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)

  if (-not [Win]::IsWindowVisible($hWnd)) { return $true }
  $title = [Win]::TitleOf($hWnd)
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }

  foreach ($p in $patterns) {
    if ($title -like "*$p*") {
      [void][Win]::SendMessage($hWnd, [Win]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
      $closed.Add($title) | Out-Null
      break
    }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null

if ($closed.Count -gt 0) {
  "CLOSED_WINDOWS:"; $closed | Select-Object -Unique
} else {
  "NO_MATCHING_WINDOWS_FOUND"
}
