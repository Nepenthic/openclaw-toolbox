$ErrorActionPreference='SilentlyContinue'

'=== TASKS (OpenClaw) ==='
schtasks /Query /FO LIST /V | Select-String -Pattern 'TaskName:|Task To Run:|Status:|Last Run Time:|Last Result:|Run As User:' | Select-String -Pattern 'OpenClaw|Task To Run|Status|Last Result|Run As User'

'=== PROCESSES (openclaw node/gateway) ==='
Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','OpenClaw.exe','openclaw.exe') -or ($_.CommandLine -match 'openclaw') } |
  Select-Object ProcessId,Name,CommandLine |
  Where-Object { $_.CommandLine -match 'openclaw' -or $_.CommandLine -match '18789' -or $_.CommandLine -match 'gateway' -or $_.CommandLine -match 'node run' } |
  Format-List

'=== PORTS 18789/18800-ish ==='
try { netstat -ano | Select-String -Pattern ':18789\s' } catch {}
try { netstat -ano | Select-String -Pattern ':18788\s|:18790\s|:18789\s' } catch {}
