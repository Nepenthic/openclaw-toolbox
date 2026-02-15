# Shared rules for scan/redact

$Global:QuarantineRules = @(
  # Generic “token-ish” long strings
  @{ Name='LongTokenLike'; Pattern='(?i)\b[a-z0-9_\-]{35,}\b'; Redact='[REDACTED_TOKEN]' },

  # OpenAI-style keys
  @{ Name='OpenAIKey'; Pattern='\bsk-[A-Za-z0-9]{20,}\b'; Redact='sk-[REDACTED]' },

  # Discord bot token (very rough heuristic)
  @{ Name='DiscordToken'; Pattern='(?i)\b(mfa\.[A-Za-z0-9_\-]{80,}|[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{20,})\b'; Redact='[REDACTED_DISCORD_TOKEN]' },

  # Authorization headers
  @{ Name='AuthHeader'; Pattern='(?i)(Authorization\s*:\s*)(Bearer\s+)[^\r\n]+'; Redact='${1}${2}[REDACTED]' },

  # Common env var assignments for secrets
  @{ Name='EnvSecret'; Pattern='(?i)\b(OPENAI_API_KEY|DISCORD_TOKEN|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET)\s*=\s*[^\s\r\n]+'; Redact='${1}=[REDACTED]' }
)

$Global:InjectionFlags = @(
  'ignore previous instructions',
  'system prompt',
  'developer message',
  'you are chatgpt',
  'do not follow',
  'bypass',
  'exfiltrate',
  'send me your',
  'run this command'
)

$Global:RiskyCommandFlags = @(
  'rm -rf',
  'del /f',
  'format ',
  'reg delete',
  'powershell -enc',
  'iwr ',
  'curl ',
  'Invoke-WebRequest',
  'Invoke-Expression',
  'Start-Process.*-Verb\s+RunAs'
)
