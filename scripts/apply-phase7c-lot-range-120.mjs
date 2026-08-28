import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function file(rel) {
  return path.join(root, rel);
}

function read(rel) {
  return fs.readFileSync(file(rel), "utf8");
}

function write(rel, text) {
  fs.writeFileSync(file(rel), text, "utf8");
}

function replaceExact(rel, from, to, expectedCount = 1) {
  const input = read(rel);
  const parts = input.split(from);
  const count = parts.length - 1;
  if (count !== expectedCount) {
    throw new Error(`${rel}: expected ${expectedCount} occurrences, found ${count}: ${JSON.stringify(from)}`);
  }
  write(rel, parts.join(to));
  console.log(`PATCHED=${rel}|COUNT=${count}`);
}

// API canonical validator.
replaceExact(
  "apps/api/src/services/phase7c-lot-settings.service.ts",
  `  maxDemoLot: 0.06,\n  maxManagedLot: 0.06,\n  maxTrendLot: 0.06,\n  maxSidewayLot: 0.04,`,
  `  maxDemoLot: 1.2,\n  maxManagedLot: 1.2,\n  maxTrendLot: 1.2,\n  maxSidewayLot: 1.2,`,
);
replaceExact(
  "apps/api/src/services/phase7c-lot-settings.service.ts",
  `  const units = value / PHASE7C_LOT_LIMITS.lotStep;`,
  `  const units = value / PHASE7C_LOT_LIMITS.managedLotIncrement;`,
);
replaceExact(
  "apps/api/src/services/phase7c-lot-settings.service.ts",
  `"Trend fixed lot must be between 0.03 and 0.06 and use 0.03 increments so +10 can close exactly one-third."`,
  `"Trend fixed lot must be between 0.03 and 1.20 and use 0.03 increments so +10 can close exactly one-third."`,
);
replaceExact(
  "apps/api/src/services/phase7c-lot-settings.service.ts",
  `"Sideway max lot must be between 0.03 and 0.04 and use 0.01 broker-step increments; executed Sideway lot remains exact one-third compatible."`,
  `"Sideway max lot must be between 0.03 and 1.20 and use 0.03 increments so +10 can close exactly one-third."`,
);

// Shared DEMO/LIVE risk validator used by strict LIVE preflight.
replaceExact(
  "scripts/lib/phase7c-account-mode.ps1",
  `  if ($trend -lt 0.03 -or $trend -gt 0.06) {\n    throw "$Label trendFixedLot must be between 0.03 and 0.06."\n  }\n  if ($maxLot -lt 0.03 -or $maxLot -gt 0.04) {\n    throw "$Label sidewayMaxLot must be between 0.03 and 0.04."\n  }`,
  `  if ($trend -lt 0.03 -or $trend -gt 1.20) {\n    throw "$Label trendFixedLot must be between 0.03 and 1.20."\n  }\n  if ($maxLot -lt 0.03 -or $maxLot -gt 1.20) {\n    throw "$Label sidewayMaxLot must be between 0.03 and 1.20."\n  }`,
);
replaceExact(
  "scripts/lib/phase7c-account-mode.ps1",
  `  $sidewayCapUnits = $maxLot / 0.01\n  if ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n    throw "$Label sidewayMaxLot must use 0.01 broker-step increments."\n  }`,
  `  $sidewayCapUnits = $maxLot / 0.03\n  if ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n    throw "$Label sidewayMaxLot must use 0.03 increments."\n  }`,
);

// Supervisor.
replaceExact(
  "scripts/run-phase7c-executors-local.ps1",
  `if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 0.06) { throw "TrendFixedVolume must be between 0.03 and 0.06." }`,
  `if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 1.2) { throw "TrendFixedVolume must be between 0.03 and 1.20." }`,
);
replaceExact(
  "scripts/run-phase7c-executors-local.ps1",
  `if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 0.04) { throw "SidewayMaxLot must be between 0.03 and 0.04." }`,
  `if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 1.2) { throw "SidewayMaxLot must be between 0.03 and 1.20." }`,
);
replaceExact(
  "scripts/run-phase7c-executors-local.ps1",
  `$sidewayCapUnits = $SidewayMaxLot / 0.01`,
  `$sidewayCapUnits = $SidewayMaxLot / 0.03`,
);
replaceExact(
  "scripts/run-phase7c-executors-local.ps1",
  `throw "SidewayMaxLot must use 0.01 broker-step increments."`,
  `throw "SidewayMaxLot must use 0.03 increments."`,
);

// Trend launcher.
replaceExact(
  "scripts/run-phase7c-trend-controller-local.ps1",
  `if ($FixedVolume -lt 0.03 -or $FixedVolume -gt 0.06) { throw "FixedVolume must be between 0.03 and 0.06." }`,
  `if ($FixedVolume -lt 0.03 -or $FixedVolume -gt 1.2) { throw "FixedVolume must be between 0.03 and 1.20." }`,
);

// Sideway launcher.
replaceExact(
  "scripts/run-phase7c-sideway-controller-local.ps1",
  `if ($MaxLot -lt 0.03 -or $MaxLot -gt 0.04) { throw "MaxLot must be between 0.03 and 0.04." }`,
  `if ($MaxLot -lt 0.03 -or $MaxLot -gt 1.2) { throw "MaxLot must be between 0.03 and 1.20." }`,
);
replaceExact(
  "scripts/run-phase7c-sideway-controller-local.ps1",
  `$maxLotUnits = $MaxLot / 0.01`,
  `$maxLotUnits = $MaxLot / 0.03`,
);
replaceExact(
  "scripts/run-phase7c-sideway-controller-local.ps1",
  `throw "MaxLot cap must use 0.01 broker-step increments; executed Sideway lot remains exact one-third compatible."`,
  `throw "MaxLot must use 0.03 increments so +10 can close exactly one-third."`,
);

// Direct controllers.
replaceExact(
  "scripts/run-phase7b-demo-controller.ts",
  `const MAX_TREND_FIXED_VOLUME = 0.06;`,
  `const MAX_TREND_FIXED_VOLUME = 1.2;`,
);
replaceExact(
  "scripts/run-phase7c-sideway-controller.mjs",
  `const MAX_SIDEWAY_LOT = 0.04;`,
  `const MAX_SIDEWAY_LOT = 1.2;`,
);
replaceExact(
  "scripts/run-phase7c-sideway-controller.mjs",
  `const maxLotUnits = rawMaxLot / 0.01;`,
  `const maxLotUnits = rawMaxLot / 0.03;`,
);
replaceExact(
  "scripts/run-phase7c-sideway-controller.mjs",
  `throw new Error("Phase 7C Sideway max lot cap must use 0.01 broker-step increments; executed volume remains exact one-third compatible.");`,
  `throw new Error("Phase 7C Sideway max lot must use 0.03 increments so +10 can close exactly one-third.");`,
);

// Activation.
replaceExact(
  "scripts/activate-phase7c-local.ps1",
  `if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 0.06) {\n  throw "TrendFixedVolume must be between 0.03 and 0.06 lot."\n}`,
  `if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 1.2) {\n  throw "TrendFixedVolume must be between 0.03 and 1.20 lot."\n}`,
);
replaceExact(
  "scripts/activate-phase7c-local.ps1",
  `if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 0.04) {\n  throw "SidewayMaxLot must be between 0.03 and 0.04 lot as the Auto-Lot cap."\n}\n$sidewayCapUnits = $SidewayMaxLot / 0.01\nif ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n  throw "SidewayMaxLot must use the 0.01 broker step; executed Sideway volume remains exact-one-third compatible through Auto Lot."\n}`,
  `if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 1.2) {\n  throw "SidewayMaxLot must be between 0.03 and 1.20 lot."\n}\n$sidewayCapUnits = $SidewayMaxLot / 0.03\nif ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n  throw "SidewayMaxLot must use 0.03 increments so +10 can close exactly one-third."\n}`,
);

// Web controls.
replaceExact(
  "apps/web/src/pages/Phase7CControlCenterPage.tsx",
  `label="Trend fixed lot" value={trendFixedLot} onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 0.06, step: 0.03 } }}`,
  `label="Trend fixed lot" value={trendFixedLot} onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }}`,
);
replaceExact(
  "apps/web/src/pages/Phase7CControlCenterPage.tsx",
  `label="Sideway max lot" value={sidewayMaxLot} onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 0.04, step: 0.01 } }}`,
  `label="Sideway max lot" value={sidewayMaxLot} onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }}`,
);

// API broker boundary: Sideway now shares the exact-one-third compatible 0.03 contract.
replaceExact(
  "apps/api/src/routes/phase7c.route.ts",
  `    const sidewayCapUnits = sidewayCap / step;\n    if (Math.abs(sidewayCapUnits - Math.round(sidewayCapUnits)) > 1e-8) {\n      throw new Error(\`Sideway max lot \${sidewayCap} is not compatible with broker step \${step}.\`);\n    }`,
  `    const sidewayCapUnits = sidewayCap / step;\n    if (Math.abs(sidewayCapUnits - Math.round(sidewayCapUnits)) > 1e-8 || Math.round(sidewayCapUnits) % 3 !== 0) {\n      throw new Error(\`Sideway max lot \${sidewayCap} is not compatible with broker step \${step} and exact one-third partial close.\`);\n    }`,
);

// Existing regression contract must follow the approved new policy.
{
  const rel = "scripts/phase7c-lot-settings.test.mjs";
  let t = read(rel);
  const replacements = [
    [
      `test("canonical lot bounds cap Trend at 0.06 and Sideway cap at 0.04", () => {\n  assert.equal(PHASE7C_LOT_LIMITS.maxDemoLot, 0.06, "public managed-lot ceiling must be 0.06");\n  assert.equal(PHASE7C_LOT_LIMITS.maxManagedLot, 0.06, "canonical managed-lot ceiling must be 0.06");\n  assert.equal(PHASE7C_LOT_LIMITS.maxTrendLot, 0.06, "Trend ceiling must be 0.06");\n  assert.equal(PHASE7C_LOT_LIMITS.maxSidewayLot, 0.04, "Sideway cap ceiling must be 0.04");`,
      `test("canonical lot bounds allow Trend and Sideway from 0.03 to 1.20 in 0.03 increments", () => {\n  assert.equal(PHASE7C_LOT_LIMITS.maxDemoLot, 1.2, "public managed-lot ceiling must be 1.20");\n  assert.equal(PHASE7C_LOT_LIMITS.maxManagedLot, 1.2, "canonical managed-lot ceiling must be 1.20");\n  assert.equal(PHASE7C_LOT_LIMITS.maxTrendLot, 1.2, "Trend ceiling must be 1.20");\n  assert.equal(PHASE7C_LOT_LIMITS.maxSidewayLot, 1.2, "Sideway ceiling must be 1.20");`,
    ],
    [`trendFixedLot: 0.06,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 0.04,`, `trendFixedLot: 1.2,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 1.2,`],
    [`trendFixedLot: 0.06,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 0.04,`, `trendFixedLot: 1.2,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 1.2,`],
    [`"0.04 is a Sideway Auto-Lot cap, not the executed managed lot",`, `"1.20 is valid for both Trend and Sideway under the shared 0.03 increment contract",`],
    [`trendFixedLot: 0.09,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 0.04,`, `trendFixedLot: 1.23,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 1.2,`],
    [`/Trend fixed lot.*0\\.06/i,\n    "Trend must fail closed above 0.06",`, `/Trend fixed lot.*1\\.20/i,\n    "Trend must fail closed above 1.20",`],
    [`trendFixedLot: 0.06,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 0.05,`, `trendFixedLot: 1.2,\n      sidewayRiskPercent: 0.25,\n      sidewayMaxLot: 1.23,`],
    [`/Sideway max lot.*0\\.04/i,\n    "Sideway cap must fail closed above 0.04",`, `/Sideway max lot.*1\\.20/i,\n    "Sideway max lot must fail closed above 1.20",`],
    [`test("execution boundaries distinguish Trend managed-lot increments from Sideway cap increments", () => {`, `test("execution boundaries enforce the shared 1.20 ceiling and 0.03 increments", () => {`],
    [`/\\$TrendFixedVolume\\s+-gt\\s+0\\.06/, "supervisor must cap Trend at 0.06"`, `/\\$TrendFixedVolume\\s+-gt\\s+1\\.2/, "supervisor must cap Trend at 1.20"`],
    [`/\\$SidewayMaxLot\\s+-gt\\s+0\\.04/, "supervisor must cap Sideway at 0.04"`, `/\\$SidewayMaxLot\\s+-gt\\s+1\\.2/, "supervisor must cap Sideway at 1.20"`],
    [`/\\$SidewayMaxLot\\s*\\/\\s*0\\.01/, "supervisor must treat Sideway max as a broker-step cap"`, `/\\$SidewayMaxLot\\s*\\/\\s*0\\.03/, "supervisor must preserve Sideway one-third increment"`],
    [`/\\$FixedVolume\\s+-gt\\s+0\\.06/, "Trend launcher must cap at 0.06"`, `/\\$FixedVolume\\s+-gt\\s+1\\.2/, "Trend launcher must cap at 1.20"`],
    [`/\\$MaxLot\\s+-gt\\s+0\\.04/, "Sideway launcher must cap at 0.04"`, `/\\$MaxLot\\s+-gt\\s+1\\.2/, "Sideway launcher must cap at 1.20"`],
    [`/\\$MaxLot\\s*\\/\\s*0\\.01/, "Sideway launcher must treat MaxLot as a cap increment"`, `/\\$MaxLot\\s*\\/\\s*0\\.03/, "Sideway launcher must preserve one-third increment"`],
    [`/\\$maxLot\\s*\\/\\s*0\\.01/, "shared profile must treat Sideway max as a broker-step cap"`, `/\\$maxLot\\s*\\/\\s*0\\.03/, "shared profile must preserve Sideway one-third increment"`],
    [`/MAX_TREND_FIXED_VOLUME\\s*=\\s*0\\.06/, "Trend controller must retain a direct 0.06 fail-closed ceiling"`, `/MAX_TREND_FIXED_VOLUME\\s*=\\s*1\\.2/, "Trend controller must retain a direct 1.20 fail-closed ceiling"`],
    [`/MAX_SIDEWAY_LOT\\s*=\\s*0\\.04/, "Sideway controller must retain a direct 0.04 fail-closed ceiling"`, `/MAX_SIDEWAY_LOT\\s*=\\s*1\\.2/, "Sideway controller must retain a direct 1.20 fail-closed ceiling"`],
    [`/rawMaxLot\\s*\\/\\s*0\\.01/, "Sideway controller must validate the cap at broker-step precision"`, `/rawMaxLot\\s*\\/\\s*0\\.03/, "Sideway controller must preserve one-third increment"`],
    [`/\\$TrendFixedVolume\\s+-gt\\s+0\\.06/, "base activation must cap Trend at 0.06"`, `/\\$TrendFixedVolume\\s+-gt\\s+1\\.2/, "base activation must cap Trend at 1.20"`],
    [`/\\$SidewayMaxLot\\s+-gt\\s+0\\.04/, "base activation must cap Sideway at 0.04"`, `/\\$SidewayMaxLot\\s+-gt\\s+1\\.2/, "base activation must cap Sideway at 1.20"`],
    [`/\\$SidewayMaxLot\\s*\\/\\s*0\\.01/, "base activation must treat Sideway max as a broker-step cap"`, `/\\$SidewayMaxLot\\s*\\/\\s*0\\.03/, "base activation must preserve Sideway one-third increments"`],
    [`test("API route keeps exact one-third on Trend but treats Sideway max as a broker-step cap", () => {`, `test("API route keeps exact one-third compatibility for Trend and Sideway max lot", () => {`],
    [`/Sideway max lot[^\\n]*broker step/s,\n    "Sideway max broker validation must be cap/step validation rather than executed-lot one-third validation",`, `/Sideway max lot[^\\n]*exact one-third partial close/s,\n    "Sideway max broker validation must preserve exact one-third compatibility",`],
    [`test("Web lot controls expose the canonical bounds and Sideway cap step", () => {`, `test("Web lot controls expose the shared 1.20 ceiling and 0.03 step", () => {`],
    [`/label="Trend fixed lot"[\\s\\S]*?max:\\s*0\\.06,\\s*step:\\s*0\\.03/,\n    "Web Trend control must expose max 0.06 with 0.03 managed-lot increments",`, `/label="Trend fixed lot"[\\s\\S]*?max:\\s*1\\.2,\\s*step:\\s*0\\.03/,\n    "Web Trend control must expose max 1.20 with 0.03 increments",`],
    [`/label="Sideway max lot"[\\s\\S]*?max:\\s*0\\.04,\\s*step:\\s*0\\.01/,\n    "Web Sideway cap must expose max 0.04 with broker-step 0.01 increments",`, `/label="Sideway max lot"[\\s\\S]*?max:\\s*1\\.2,\\s*step:\\s*0\\.03/,\n    "Web Sideway control must expose max 1.20 with 0.03 increments",`],
  ];
  for (const [from, to] of replacements) {
    const count = t.split(from).length - 1;
    if (count !== 1) throw new Error(`${rel}: expected exactly one regression replacement, found ${count}: ${JSON.stringify(from)}`);
    t = t.split(from).join(to);
  }
  write(rel, t);
  console.log(`PATCHED=${rel}|REGRESSION_CONTRACT=1.20_STEP_0.03`);
}

// Ensure the obsolete hard ceilings/Sideway 0.01 step are gone from the exact runtime boundaries.
const scans = [
  ["apps/api/src/services/phase7c-lot-settings.service.ts", ["maxTrendLot: 0.06", "maxSidewayLot: 0.04", "between 0.03 and 0.06", "between 0.03 and 0.04"]],
  ["scripts/lib/phase7c-account-mode.ps1", ["$trend -gt 0.06", "$maxLot -gt 0.04", "$maxLot / 0.01"]],
  ["scripts/run-phase7c-executors-local.ps1", ["$TrendFixedVolume -gt 0.06", "$SidewayMaxLot -gt 0.04", "$SidewayMaxLot / 0.01"]],
  ["scripts/run-phase7c-trend-controller-local.ps1", ["$FixedVolume -gt 0.06"]],
  ["scripts/run-phase7c-sideway-controller-local.ps1", ["$MaxLot -gt 0.04", "$MaxLot / 0.01"]],
  ["scripts/run-phase7b-demo-controller.ts", ["MAX_TREND_FIXED_VOLUME = 0.06"]],
  ["scripts/run-phase7c-sideway-controller.mjs", ["MAX_SIDEWAY_LOT = 0.04", "rawMaxLot / 0.01"]],
  ["scripts/activate-phase7c-local.ps1", ["$TrendFixedVolume -gt 0.06", "$SidewayMaxLot -gt 0.04", "$SidewayMaxLot / 0.01"]],
  ["apps/web/src/pages/Phase7CControlCenterPage.tsx", ["max: 0.06, step: 0.03", "max: 0.04, step: 0.01"]],
];
for (const [rel, forbidden] of scans) {
  const t = read(rel);
  for (const token of forbidden) {
    if (t.includes(token)) throw new Error(`${rel}: obsolete lot contract remains: ${token}`);
  }
}

console.log("PHASE7C_LOT_RANGE_120_PATCH=PASS");
