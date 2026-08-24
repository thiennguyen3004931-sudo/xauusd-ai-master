param(
  [string]$ProjectRoot = '',
  [string]$EnvFile = '',
  [switch]$ConfirmNotificationOnly
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmNotificationOnly) {
  throw 'Explicit -ConfirmNotificationOnly is required. This test sends Telegram messages only; it never sends broker orders.'
}
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if ([string]::IsNullOrWhiteSpace($EnvFile)) { $EnvFile = Join-Path $ProjectRoot '.env.phase7b-telegram' }
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw "Telegram env file not found: $EnvFile" }

function Read-DotEnv([string]$Path) {
  $map = @{}
  foreach ($raw in Get-Content -LiteralPath $Path) {
    $line = ([string]$raw).Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $eq = $line.IndexOf('=')
    if ($eq -le 0) { continue }
    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

function Send-TestMessage([string]$Token, [string]$ChatId, [string]$ThreadId, [string]$Text) {
  $uri = "https://api.telegram.org/bot$Token/sendMessage"
  $body = @{ chat_id = $ChatId; text = $Text; disable_web_page_preview = 'true' }
  if (-not [string]::IsNullOrWhiteSpace($ThreadId)) { $body.message_thread_id = $ThreadId }
  $result = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 15
  if (-not $result.ok) { throw 'Telegram sendMessage returned ok=false.' }
  return $result
}

$config = Read-DotEnv -Path $EnvFile
$token = [string]$config['ZIQ_TELEGRAM_BOT_TOKEN']
$chatId = [string]$config['ZIQ_TELEGRAM_CHAT_ID']
$threadId = [string]$config['ZIQ_TELEGRAM_MESSAGE_THREAD_ID']
$symbol = [string]$config['ZIQ_TELEGRAM_SYMBOL']
if ([string]::IsNullOrWhiteSpace($symbol)) { $symbol = 'XAUUSD' }
if ([string]::IsNullOrWhiteSpace($token) -or $token -match 'REPLACE_WITH') { throw 'ZIQ_TELEGRAM_BOT_TOKEN is missing/not configured.' }
if ([string]::IsNullOrWhiteSpace($chatId) -or $chatId -match 'REPLACE_WITH') { throw 'ZIQ_TELEGRAM_CHAT_ID is missing/not configured.' }

Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST=START'
Write-Host "PHASE7C_TELEGRAM_NOTIFICATION_TEST_SYMBOL=$symbol"
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST_TOKEN=CONFIGURED_NOT_PRINTED'
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST_CHAT_ID=CONFIGURED_NOT_PRINTED'

$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
$messages = @(
  "🧪 TEST · SETUP_READY`n$symbol · TREND · BUY`nMẫu: ENGULFING`nEntry dự kiến: 4662.63 · SL: 4654.40`n⚠️ TEST - KHÔNG PHẢI LỆNH THẬT`n$stamp",
  "🧪 TEST · ENTRY_FILLED`n$symbol · TREND · BUY · 0.12 lot`nEntry: 4662.63 · SL: 4654.40`nLý do: setup Trend hợp lệ`n⚠️ TEST - KHÔNG PHẢI LỆNH THẬT`n$stamp",
  "🧪 TEST · SL_TO_BE`n$symbol · +6 giá`nSL → Entry / Break-even`nLý do giữ: xu hướng còn hợp lệ`n⚠️ TEST - KHÔNG PHẢI LỆNH THẬT`n$stamp",
  "🧪 TEST · PARTIAL_1_3`n$symbol · +10 giá`nĐã mô phỏng chốt 1/3 vị thế`nPhần còn lại tiếp tục được quản lý`n⚠️ TEST - KHÔNG PHẢI LỆNH THẬT`n$stamp",
  "🧪 TEST · POSITION_CLOSED`n$symbol · TREND`nProfit mô phỏng: +12.34 USD`nLý do đóng: TEST_NOTIFICATION_FLOW`n⚠️ TEST - KHÔNG PHẢI LỆNH THẬT`n$stamp"
)

$sent = 0
foreach ($message in $messages) {
  [void](Send-TestMessage -Token $token -ChatId $chatId -ThreadId $threadId -Text $message)
  $sent += 1
  Write-Host "PHASE7C_TELEGRAM_NOTIFICATION_TEST_SENT=$sent"
  Start-Sleep -Milliseconds 350
}

Write-Host "PHASE7C_TELEGRAM_NOTIFICATION_TEST_TOTAL=$sent"
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST_BROKER_ORDER_SEND=False'
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST_POSITION_MUTATION=False'
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST_ACCOUNT_SWITCH=False'
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST_BOT_MODE_MUTATION=False'
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST_LIVE_ARM_MUTATION=False'
Write-Host 'PHASE7C_TELEGRAM_NOTIFICATION_TEST=PASS'
