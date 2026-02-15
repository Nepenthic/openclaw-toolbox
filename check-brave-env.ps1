$v = [Environment]::GetEnvironmentVariable('BRAVE_API_KEY','User')
if($v -and $v.Length -gt 6){
  "BRAVE_API_KEY: SET len=$($v.Length)"
} else {
  'BRAVE_API_KEY: NOT_SET'
}
