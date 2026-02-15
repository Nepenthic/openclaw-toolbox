param(
  [string]$Ip = '192.168.86.236',
  [int]$Port = 18789,
  [int]$TimeoutMs = 700
)

$ErrorActionPreference='SilentlyContinue'

function Test-TcpPort($host,$port,$ms){
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($host,$port,$null,$null)
    $ok = $iar.AsyncWaitHandle.WaitOne($ms,$false)
    if(-not $ok){ $client.Close(); return $false }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch {
    try { $client.Close() } catch {}
    return $false
  }
}

$open = Test-TcpPort $Ip $Port $TimeoutMs
if($open){
  "TCP_OPEN ${Ip}:$Port"
} else {
  "TCP_CLOSED_OR_FILTERED ${Ip}:$Port"
}
