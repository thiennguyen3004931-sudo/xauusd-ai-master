param(
  [string]$OutputDir = "artifacts",
  [string]$RequiredCommit = "",
  [string]$ReleaseName = "XAUUSD_AI_MASTER_PORTABLE"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Git([string[]]$Arguments) {
  $git = Get-Command git -ErrorAction Stop
  $output = & $git.Source @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
  return $output
}

function Get-RelativePathCompat([string]$BasePath, [string]$FullPath) {
  $base = New-Object System.Uri(($BasePath.TrimEnd('\') + '\'))
  $item = New-Object System.Uri($FullPath)
  return [System.Uri]::UnescapeDataString($base.MakeRelativeUri($item).ToString()).Replace('/', '\')
}

function Test-ForbiddenPortablePath([string]$RelativePath) {
  $normalized = $RelativePath.Replace('\', '/').TrimStart('/')
  $segments = @($normalized.Split('/') | Where-Object { $_ -ne '' })
  foreach ($segment in $segments) {
    if ($segment -in @('.runtime', 'node_modules', 'dist', '.next', '.turbo', 'coverage', 'logs')) {
      return $true
    }
  }

  $leaf = [System.IO.Path]::GetFileName($normalized)
  if ($leaf -eq '.env') { return $true }
  if ($leaf -like '.env.*' -and $leaf -notlike '*.example') { return $true }
  if ($leaf -match '\.(?:db|db-shm|db-wal|sqlite|sqlite3|log)$') { return $true }
  return $false
}

Push-Location $ProjectRoot
$tempRoot = $null
try {
  Write-Host "PHASE7C_PORTABLE_PACKAGE=START"

  [void](Get-Command git -ErrorAction Stop)
  $dirty = @(Invoke-Git @('status', '--porcelain'))
  if ($dirty.Count -gt 0) {
    throw "Portable packaging requires a clean tracked working tree. Commit or stash changes first."
  }
  Write-Host "PHASE7C_PORTABLE_PACKAGE_GIT_CLEAN=PASS"

  $commit = ([string](Invoke-Git @('rev-parse', 'HEAD'))).Trim()
  $branch = ([string](Invoke-Git @('branch', '--show-current'))).Trim()
  if ([string]::IsNullOrWhiteSpace($branch)) { $branch = 'DETACHED_HEAD' }

  if (-not [string]::IsNullOrWhiteSpace($RequiredCommit)) {
    & git cat-file -e "$RequiredCommit^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Required commit does not exist locally: $RequiredCommit" }
    & git merge-base --is-ancestor $RequiredCommit $commit 2>$null
    if ($LASTEXITCODE -ne 0) { throw "HEAD does not contain required commit: $RequiredCommit" }
  }

  if (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir = Join-Path $ProjectRoot $OutputDir
  }
  [System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null
  $OutputDir = (Resolve-Path -LiteralPath $OutputDir).Path

  $shortSha = $commit.Substring(0, [Math]::Min(12, $commit.Length))
  $safeReleaseName = ($ReleaseName -replace '[^A-Za-z0-9_.-]', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($safeReleaseName)) { throw "ReleaseName is invalid." }
  $baseName = "${safeReleaseName}_${shortSha}"
  $finalZip = Join-Path $OutputDir "$baseName.zip"
  $shaFile = Join-Path $OutputDir "$baseName.sha256.txt"

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("xauusd-portable-" + [guid]::NewGuid().ToString('N'))
  $staging = Join-Path $tempRoot 'staging'
  $sourceZip = Join-Path $tempRoot 'source.zip'
  [System.IO.Directory]::CreateDirectory($staging) | Out-Null

  & git archive --format=zip --output=$sourceZip $commit
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sourceZip)) {
    throw "git archive failed."
  }
  Expand-Archive -LiteralPath $sourceZip -DestinationPath $staging -Force

  $forbidden = @()
  foreach ($file in @(Get-ChildItem -LiteralPath $staging -Recurse -File -Force)) {
    $relative = Get-RelativePathCompat -BasePath $staging -FullPath $file.FullName
    if (Test-ForbiddenPortablePath $relative) { $forbidden += $relative }
  }
  if ($forbidden.Count -gt 0) {
    throw "Portable package contains forbidden runtime/secret artifacts: $($forbidden -join ', ')"
  }

  $manifest = [ordered]@{
    schemaVersion = 1
    project = 'XAUUSD_AI_MASTER'
    sourceCommit = $commit
    sourceBranch = $branch
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
    packageManager = 'pnpm@10.18.0'
    recommendedNode = '24.x'
    recommendedPython = '3.12.x'
    executionHost = 'Windows with MetaTrader 5'
    mobileDevelopment = 'GitHub Codespaces/browser development only; MT5 execution remains on Windows.'
    containsRuntimeState = $false
    containsLocalEnv = $false
    containsCredentials = $false
    containsMt5DataDirectories = $false
    safety = [ordered]@{
      liveArmIncluded = $false
      accountSwitchPerformed = $false
      orderSendPerformed = $false
      portablePackageIsSourceOnly = $true
    }
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $staging 'PORTABLE-RELEASE-MANIFEST.json') -Encoding UTF8

  if (Test-Path -LiteralPath $finalZip) { Remove-Item -LiteralPath $finalZip -Force }
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $finalZip -CompressionLevel Optimal
  if (-not (Test-Path -LiteralPath $finalZip)) { throw "Portable ZIP was not created." }

  $hash = Get-FileHash -LiteralPath $finalZip -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($finalZip))" | Set-Content -LiteralPath $shaFile -Encoding ASCII

  Write-Host "PHASE7C_PORTABLE_PACKAGE_SECRETS_EXCLUDED=PASS"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_RUNTIME_EXCLUDED=PASS"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_SOURCE_COMMIT=$commit"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_SOURCE_BRANCH=$branch"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_ZIP=$finalZip"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_SHA256=$($hash.Hash.ToLowerInvariant())"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_LIVE_ARM=False"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_ACCOUNT_SWITCH=False"
  Write-Host "PHASE7C_PORTABLE_PACKAGE_ORDER_SEND=False"
  Write-Host "PHASE7C_PORTABLE_PACKAGE=PASS"
}
finally {
  if ($tempRoot -and (Test-Path -LiteralPath $tempRoot)) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}