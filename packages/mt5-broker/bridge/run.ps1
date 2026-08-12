$ErrorActionPreference = "Stop"

if (-not (Test-Path ".venv")) {
  py -3 -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created bridge/.env. Edit it before starting the bridge." -ForegroundColor Yellow
  exit 1
}

Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
}

.\.venv\Scripts\python.exe -m uvicorn mt5_bridge.app:app --host $env:MT5_BRIDGE_HOST --port $env:MT5_BRIDGE_PORT
