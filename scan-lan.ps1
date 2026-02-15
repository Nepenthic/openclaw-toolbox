$ErrorActionPreference='SilentlyContinue'

$subnet = '192.168.86'
$targets = 1..254 | ForEach-Object { "$subnet.$_" }

# Faster, low-impact sweep: ping sequentially with short timeout.
$online = New-Object System.Collections.Generic.List[string]
foreach($ip in $targets){
  if(Test-Connection -Quiet -Count 1 -TimeoutSeconds 1 $ip){
    $online.Add($ip) | Out-Null
  }
}

Start-Sleep -Milliseconds 200

# Pull neighbor/MAC table
$neighbors = @()
try {
  $neighbors = Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "$subnet.*" } |
    Select-Object @{n='IP';e={$_.IPAddress}}, @{n='MAC';e={$_.LinkLayerAddress}}, @{n='State';e={$_.State}}
} catch {
  $arp = arp -a | Select-String -Pattern "$subnet\."
  $neighbors = $arp | ForEach-Object {
    $parts = ($_ -replace '\s+',' ').Trim().Split(' ')
    [pscustomobject]@{ IP=$parts[0]; MAC=$parts[1]; State=$parts[2] }
  }
}

$onlineSet = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$online | ForEach-Object { [void]$onlineSet.Add([string]$_) }

$neighbors | Sort-Object IP | ForEach-Object {
  [pscustomobject]@{
    IP    = $_.IP
    MAC   = $_.MAC
    State = $_.State
    Ping  = if($onlineSet.Contains([string]$_.IP)){'Yes'} else {'No'}
  }
} | Format-Table -AutoSize

'--- ONLINE (PING RESPONDED) ---'
($online | Sort-Object) -join "`n"
