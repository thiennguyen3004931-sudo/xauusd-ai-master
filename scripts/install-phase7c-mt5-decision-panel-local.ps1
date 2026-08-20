param(
  [string]$BridgeEnv = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [string]$TerminalPath = "",
  [string]$DataPath = "",
  [string]$ApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD",
  [switch]$SkipCompile
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $ProjectRoot "mt5\XAUUSD_AI_Master_Decision_Panel.mq5"
if (-not (Test-Path -LiteralPath $Source)) { throw "MT5 decision panel source not found: $Source" }

if (-not [System.IO.Path]::IsPathRooted($BridgeEnv)) {
  $BridgeEnv = Join-Path $ProjectRoot $BridgeEnv
}

function Read-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  foreach ($raw in Get-Content -LiteralPath $Path) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $index = $line.IndexOf("=")
    if ($line.Substring(0, $index).Trim().TrimStart([char]0xFEFF) -ne $Name) { continue }
    $value = $line.Substring($index + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

if ([string]::IsNullOrWhiteSpace($TerminalPath)) {
  $TerminalPath = Read-EnvValue $BridgeEnv "MT5_TERMINAL_PATH"
}
if ([string]::IsNullOrWhiteSpace($TerminalPath) -or -not (Test-Path -LiteralPath $TerminalPath)) {
  throw "Cannot resolve MT5 terminal64.exe. Pass -TerminalPath or configure MT5_TERMINAL_PATH in $BridgeEnv"
}
$TerminalPath = (Resolve-Path -LiteralPath $TerminalPath).Path

if ([string]::IsNullOrWhiteSpace($DataPath)) {
  $portable = (Read-EnvValue $BridgeEnv "MT5_PORTABLE") -match '^(1|true|yes|on)$'
  if ($portable) {
    $DataPath = Split-Path -Parent $TerminalPath
  } else {
    $terminalRoot = Join-Path $env:APPDATA "MetaQuotes\Terminal"
    $matches = @()
    if (Test-Path -LiteralPath $terminalRoot) {
      foreach ($directory in Get-ChildItem -LiteralPath $terminalRoot -Directory -ErrorAction SilentlyContinue) {
        $origin = Join-Path $directory.FullName "origin.txt"
        if (-not (Test-Path -LiteralPath $origin)) { continue }
        try {
          $originPath = (Get-Content -LiteralPath $origin -Raw).Trim().Trim([char]0xFEFF)
          if ([string]::Equals($originPath, $TerminalPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            $matches += $directory.FullName
          }
        } catch {}
      }
    }
    if ($matches.Count -ne 1) {
      throw "Could not resolve one MT5 data folder for $TerminalPath. Open MT5 > File > Open Data Folder and rerun with -DataPath '<that folder>'. Matches=$($matches.Count)"
    }
    $DataPath = $matches[0]
  }
}

if (-not [System.IO.Path]::IsPathRooted($DataPath)) {
  $DataPath = Join-Path $ProjectRoot $DataPath
}
if (-not (Test-Path -LiteralPath $DataPath)) { throw "MT5 data folder not found: $DataPath" }
$DataPath = (Resolve-Path -LiteralPath $DataPath).Path

$ExpertDir = Join-Path $DataPath "MQL5\Experts\XAUUSD_AI_MASTER"
New-Item -ItemType Directory -Force -Path $ExpertDir | Out-Null
$Destination = Join-Path $ExpertDir "XAUUSD_AI_Master_Decision_Panel.mq5"
Copy-Item -LiteralPath $Source -Destination $Destination -Force

if (-not $SkipCompile) {
  $terminalDir = Split-Path -Parent $TerminalPath
  $MetaEditor = @(
    (Join-Path $terminalDir "MetaEditor64.exe"),
    (Join-Path $terminalDir "metaeditor64.exe")
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($MetaEditor)) {
    throw "MetaEditor64.exe was not found beside $TerminalPath. Rerun with -SkipCompile, then compile the panel EA manually."
  }
  $CompileLog = Join-Path $ExpertDir "XAUUSD_AI_Master_Decision_Panel.compile.log"
  $arguments = @(
    ('/compile:"{0}"' -f $Destination),
    ('/log:"{0}"' -f $CompileLog)
  )
  $compileStartedAt = (Get-Date).ToUniversalTime()
  $process = Start-Process -FilePath $MetaEditor -ArgumentList $arguments -Wait -PassThru
  $Compiled = [System.IO.Path]::ChangeExtension($Destination, ".ex5")
  $compiledFresh = (Test-Path -LiteralPath $Compiled) -and
    (Get-Item -LiteralPath $Compiled).LastWriteTimeUtc -ge $compileStartedAt.AddSeconds(-2)
  if (-not $compiledFresh) {
    $detail = if (Test-Path -LiteralPath $CompileLog) { (Get-Content -LiteralPath $CompileLog -Tail 80) -join [Environment]::NewLine } else { "compile log missing" }
    throw "MT5 panel EA compile failed. ExitCode=$($process.ExitCode)`n$detail"
  }
  Write-Host "PHASE7C_MT5_PANEL_COMPILE=PASS"
  Write-Host "PHASE7C_MT5_PANEL_EX5=$Compiled"
} else {
  Write-Host "PHASE7C_MT5_PANEL_COMPILE=SKIPPED"
}

try {
  $probe = Invoke-WebRequest -Uri $ApiUrl -UseBasicParsing -TimeoutSec 8
  if ($probe.StatusCode -ne 200 -or $probe.Content -notmatch '(?m)^mt5OrderPermission=NONE$') {
    throw "Decision endpoint safety marker is missing."
  }
  Write-Host "PHASE7C_MT5_PANEL_API=PASS"
} catch {
  Write-Warning "Decision endpoint is not ready yet: $($_.Exception.Message)"
  Write-Host "PHASE7C_MT5_PANEL_API=CHECK_AFTER_ACTIVATION"
}

Write-Host "PHASE7C_MT5_PANEL_INSTALL=PASS"
Write-Host "PHASE7C_MT5_PANEL_SOURCE=$Destination"
Write-Host "PHASE7C_MT5_PANEL_WEBREQUEST_ALLOW=http://127.0.0.1:3711"
Write-Host "PHASE7C_MT5_PANEL_API_URL=$ApiUrl"
Write-Host "PHASE7C_MT5_PANEL_ORDER_PERMISSION=NONE"
Write-Host "PHASE7C_MT5_PANEL_NEXT=MT5 Tools > Options > Expert Advisors > Allow WebRequest; add http://127.0.0.1:3711; then attach Expert Advisor XAUUSD_AI_MASTER\\XAUUSD_AI_Master_Decision_Panel to the XAUUSD chart."
