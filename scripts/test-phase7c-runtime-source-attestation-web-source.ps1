$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Types = Join-Path $ProjectRoot "apps\web\src\phase7c-runtime-source-attestation-types.ts"
$Api = Join-Path $ProjectRoot "apps\web\src\phase7c-runtime-source-attestation-api.ts"
$Card = Join-Path $ProjectRoot "apps\web\src\ui\Phase7CRuntimeSourceAttestationCard.tsx"
$Shell = Join-Path $ProjectRoot "apps\web\src\pages\Phase7CControlCenterShellPage.tsx"

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

foreach ($path in @($Types, $Api, $Card, $Shell)) {
  Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "Task5 source missing: $path"
}

$typesText = (Get-Content -LiteralPath $Types -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$apiText = (Get-Content -LiteralPath $Api -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$cardText = (Get-Content -LiteralPath $Card -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$shellText = (Get-Content -LiteralPath $Shell -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

Assert-True ($typesText.Contains('Phase7CRuntimeSourceAttestationSnapshot')) "Task5 Web response type missing"
Assert-True ($apiText.Contains('getPhase7CRuntimeSourceAttestation')) "Task5 Web GET client missing"
Assert-True ($apiText.Contains('/api/v1/phase7c/runtime-source-attestation')) "Task5 Web client must use exact GET endpoint"
Assert-True ($apiText.Contains('cache: "no-store"')) "Task5 Web attestation GET must be no-store"

Assert-True ($cardText.Contains('phase7c-runtime-source-attestation')) "Task5 card query key missing"
Assert-True ($cardText.Contains('refetchInterval: 5000')) "Task5 card must refresh every 5 seconds"
Assert-True ($cardText.Contains('retry: false')) "Task5 card must not retry hidden failures"
Assert-True ($cardText.Contains('READ-ONLY WARNING — NO AUTOMATIC ACTION TAKEN')) "Task5 exact read-only warning copy missing"
foreach ($component in @('api','lifecycle-broker','supervisor','trend','sideway','telegram','regime-notifier')) {
  Assert-True ($cardText.Contains($component)) "Task5 card missing component row token: $component"
}
foreach ($forbidden in @('useMutation', 'setPhase7CBotMode', 'runPhase7CLifecycleAction', 'ARM_LIVE', 'DISARM_LIVE', 'fetch(', 'method: "POST"')) {
  Assert-True (-not $cardText.Contains($forbidden)) "Task5 card contains forbidden mutation/action token: $forbidden"
}

$authIndex = $shellText.IndexOf('<Phase7CExecutionAuthorizationCard />', [System.StringComparison]::Ordinal)
$cardIndex = $shellText.IndexOf('<Phase7CRuntimeSourceAttestationCard />', [System.StringComparison]::Ordinal)
$controlIndex = $shellText.IndexOf('<Phase7CControlCenterPage />', [System.StringComparison]::Ordinal)
Assert-True ($authIndex -ge 0 -and $cardIndex -gt $authIndex -and $controlIndex -gt $cardIndex) "Task5 card must mount between authorization and control content"

Write-Host "PHASE7C_RUNTIME_SOURCE_ATTESTATION_WEB_SOURCE_TEST=PASS"
