Set-StrictMode -Version Latest

function Open-Phase7CStartupRunnerLock([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "Startup runner lock path is required."
  }

  $directory = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  try {
    $stream = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch [System.IO.IOException] {
    throw "Another Phase7C startup runner already owns the exclusive lock: $Path"
  }

  try {
    $metadata = [pscustomobject]@{
      version = 1
      runnerPid = $PID
      acquiredAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($metadata)
    $stream.SetLength(0)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
    $stream.Position = 0
    return $stream
  } catch {
    $stream.Dispose()
    throw
  }
}

function Write-Phase7CJsonAtomic(
  [Parameter(Mandatory = $true)] [string]$Path,
  [Parameter(Mandatory = $true)] $Value,
  [int]$Depth = 6
) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "Atomic JSON path is required."
  }

  $directory = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $tempPath = "$Path.$PID.$([Guid]::NewGuid().ToString('N')).tmp"
  try {
    $json = $Value | ConvertTo-Json -Depth $Depth
    [System.IO.File]::WriteAllText(
      $tempPath,
      $json,
      [System.Text.UTF8Encoding]::new($false)
    )

    if ([System.IO.File]::Exists($Path)) {
      [System.IO.File]::Replace($tempPath, $Path, $null, $true)
    } else {
      [System.IO.File]::Move($tempPath, $Path)
    }
  } finally {
    if ([System.IO.File]::Exists($tempPath)) {
      Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
  }
}
