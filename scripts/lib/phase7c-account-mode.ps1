function ConvertTo-Phase7CAccountMode([string]$Value) {
  Set-StrictMode -Version Latest
  $mode = ([string]$Value).Trim().ToUpperInvariant()
  if ($mode -notin @("DEMO", "LIVE")) {
    throw "Phase7C account mode must be DEMO or LIVE. Actual=$Value"
  }
  return $mode
}

function Get-Phase7CEnvValue([string]$Path, [string]$Name) {
  Set-StrictMode -Version Latest
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  foreach ($raw in Get-Content -LiteralPath $Path) {
    $line = ([string]$raw).Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $index = $line.IndexOf("=")
    $key = $line.Substring(0, $index).Trim().TrimStart([char]0xFEFF)
    if ($key -ne $Name) { continue }
    $value = $line.Substring($index + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

function Test-Phase7CTruthy([string]$Value) {
  Set-StrictMode -Version Latest
  return ([string]$Value) -match '^(?i:1|true|yes|on)$'
}

function Get-Phase7CAllowedLogins([string]$EnvFile) {
  Set-StrictMode -Version Latest
  $raw = Get-Phase7CEnvValue $EnvFile "MT5_ALLOWED_LOGINS"
  $values = @()
  foreach ($item in @($raw -split ',')) {
    $trimmed = ([string]$item).Trim()
    if (-not $trimmed) { continue }
    $parsed = 0L
    if (-not [long]::TryParse($trimmed, [ref]$parsed) -or $parsed -le 0) {
      throw "MT5_ALLOWED_LOGINS contains an invalid login value in $EnvFile."
    }
    $values += $parsed
  }
  return @($values | Sort-Object -Unique)
}

function Assert-Phase7CAccountEnv(
  [string]$EnvFile,
  [string]$AccountMode,
  [switch]$RequireTrading
) {
  Set-StrictMode -Version Latest
  $mode = ConvertTo-Phase7CAccountMode $AccountMode
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Phase7C $mode environment file not found: $EnvFile"
  }

  $apiKey = Get-Phase7CEnvValue $EnvFile "MT5_API_KEY"
  if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey -eq "CHANGE_ME_TO_A_LONG_RANDOM_SECRET") {
    throw "MT5_API_KEY must be configured locally in $EnvFile."
  }

  $hostValue = Get-Phase7CEnvValue $EnvFile "MT5_BRIDGE_HOST"
  if ([string]::IsNullOrWhiteSpace($hostValue)) { $hostValue = "127.0.0.1" }
  if ($hostValue -notin @("127.0.0.1", "localhost", "::1")) {
    throw "Phase7C account switching only supports a localhost MT5 bridge. Actual host=$hostValue"
  }

  $portValue = Get-Phase7CEnvValue $EnvFile "MT5_BRIDGE_PORT"
  if ([string]::IsNullOrWhiteSpace($portValue)) { $portValue = "8765" }
  $port = 0
  if (-not [int]::TryParse($portValue, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw "MT5_BRIDGE_PORT is invalid in $EnvFile."
  }

  $allowReal = Test-Phase7CTruthy (Get-Phase7CEnvValue $EnvFile "MT5_ALLOW_REAL_ACCOUNT")
  $tradingEnabled = Test-Phase7CTruthy (Get-Phase7CEnvValue $EnvFile "MT5_TRADING_ENABLED")
  $allowedLogins = @(Get-Phase7CAllowedLogins $EnvFile)

  if ($mode -eq "DEMO" -and $allowReal) {
    throw "DEMO env must keep MT5_ALLOW_REAL_ACCOUNT=false."
  }
  if ($mode -eq "LIVE" -and -not $allowReal) {
    throw "LIVE env requires MT5_ALLOW_REAL_ACCOUNT=true."
  }
  if ($RequireTrading -and -not $tradingEnabled) {
    throw "$mode execution requires MT5_TRADING_ENABLED=true."
  }
  if ($RequireTrading -and $allowedLogins.Count -eq 0) {
    throw "$mode execution requires a non-empty MT5_ALLOWED_LOGINS allowlist."
  }

  return [pscustomobject]@{
    accountMode = $mode
    envFile = (Resolve-Path -LiteralPath $EnvFile).Path
    apiKey = $apiKey
    bridgeHost = $hostValue
    bridgePort = $port
    tradingEnabled = $tradingEnabled
    allowRealAccount = $allowReal
    allowedLogins = $allowedLogins
  }
}

function Assert-Phase7CRiskProfile($Profile, [string]$Label = "Phase7C risk profile") {
  Set-StrictMode -Version Latest
  if ($null -eq $Profile) { throw "$Label is missing." }
  if ([int]$Profile.version -ne 1) { throw "$Label version must be 1." }
  $trend = [double]$Profile.trendFixedLot
  $risk = [double]$Profile.sidewayRiskPercent
  $maxLot = [double]$Profile.sidewayMaxLot
  foreach ($item in @(
    [pscustomobject]@{ Value = $trend; Name = "trendFixedLot" },
    [pscustomobject]@{ Value = $maxLot; Name = "sidewayMaxLot" }
  )) {
    if ($item.Value -lt 0.03 -or $item.Value -gt 0.30) {
      throw "$Label $($item.Name) must be between 0.03 and 0.30."
    }
    $units = $item.Value / 0.03
    if ([math]::Abs($units - [math]::Round($units)) -gt 1e-8) {
      throw "$Label $($item.Name) must use 0.03 increments."
    }
  }
  if ($risk -lt 0.01 -or $risk -gt 1.0) {
    throw "$Label sidewayRiskPercent must be between 0.01 and 1.00."
  }
  return [pscustomobject]@{
    version = 1
    trendFixedLot = $trend
    sidewayRiskPercent = $risk
    sidewayMaxLot = $maxLot
  }
}

function Get-Phase7CRiskProfilePath([string]$WorkDir, [string]$AccountMode) {
  Set-StrictMode -Version Latest
  $mode = (ConvertTo-Phase7CAccountMode $AccountMode).ToLowerInvariant()
  return Join-Path $WorkDir "phase7c-lot-settings.$mode.json"
}

function Write-Phase7CAccountJsonAtomic([string]$Path, $Value, [int]$Depth = 8) {
  Set-StrictMode -Version Latest
  $directory = Split-Path -Parent $Path
  if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
  $token = "$PID.$([guid]::NewGuid().ToString('N'))"
  $tempPath = "$Path.$token.tmp"
  $backupPath = "$Path.$token.bak"
  try {
    $json = $Value | ConvertTo-Json -Depth $Depth
    [System.IO.File]::WriteAllText($tempPath, "$json`n", [System.Text.UTF8Encoding]::new($false))
    if ([System.IO.File]::Exists($Path)) {
      [System.IO.File]::Replace($tempPath, $Path, $backupPath)
      if ([System.IO.File]::Exists($backupPath)) { [System.IO.File]::Delete($backupPath) }
    } else {
      [System.IO.File]::Move($tempPath, $Path)
    }
  } finally {
    foreach ($candidate in @($tempPath, $backupPath)) {
      if ([System.IO.File]::Exists($candidate)) {
        Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
      }
    }
  }
}
