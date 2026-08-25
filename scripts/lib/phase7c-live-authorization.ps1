function Get-Phase7CLiveAuthorizationPath([string]$WorkDir) {
  Set-StrictMode -Version Latest
  if ([string]::IsNullOrWhiteSpace($WorkDir)) { throw "WorkDir is required for durable LIVE authorization." }
  return Join-Path $WorkDir "phase7c-live-authorization.json"
}

function Write-Phase7CLiveAuthorizationState(
  [string]$WorkDir,
  [string]$LiveEnvFile,
  [string]$AuthorizedBy = "switch-phase7c-account-mode-local"
) {
  Set-StrictMode -Version Latest
  $identity = Get-Phase7CLiveProfileIdentity $LiveEnvFile
  $record = [pscustomobject]@{
    version = 1
    authorized = $true
    accountMode = "LIVE"
    accountLogin = [long]$identity.login
    server = [string]$identity.server
    profileFingerprint = [string]$identity.profileFingerprint
    authorizedAt = [DateTimeOffset]::UtcNow.ToString("o")
    authorizedBy = $AuthorizedBy
  }
  Write-Phase7CAccountJsonAtomic -Path (Get-Phase7CLiveAuthorizationPath $WorkDir) -Value $record -Depth 5
  Write-Host "PHASE7C_LIVE_AUTHORIZATION=PERSISTED|SERVER=$($identity.server)|PROFILE=$($identity.profileFingerprint.Substring(0, 12))"
  return $record
}
