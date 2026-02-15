$ErrorActionPreference='SilentlyContinue'
$ip='192.168.86.236'

function Test-TcpPort($host,$port,$ms=300){
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

'PING:'
try { Test-Connection -Count 1 -Quiet -TimeoutSeconds 1 $ip } catch { $false }

'ARP:'
arp -a | Select-String -SimpleMatch $ip

'PORTS (300ms timeout):'
$ports = 22,80,443,445,3389,5900,8123,3000,5000,8000,8080,8443
foreach($p in $ports){
  if(Test-TcpPort $ip $p 300){ "OPEN $p" }
}

'REVERSE_DNS:'
try { [System.Net.Dns]::GetHostEntry($ip).HostName } catch { 'no reverse dns' }
