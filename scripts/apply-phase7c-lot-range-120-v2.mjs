import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const p = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(p(rel), "utf8");
const write = (rel, text) => fs.writeFileSync(p(rel), text, "utf8");

function replaceExact(rel, from, to, expected = 1) {
  const input = read(rel);
  const count = input.split(from).length - 1;
  if (count !== expected) throw new Error(`${rel}: expected ${expected}, found ${count}: ${JSON.stringify(from)}`);
  write(rel, input.split(from).join(to));
  console.log(`PATCHED=${rel}|COUNT=${count}`);
}

function replaceRegex(rel, regex, replacement, label) {
  const input = read(rel);
  const matches = [...input.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`${rel}: expected one ${label}, found ${matches.length}`);
  write(rel, input.replace(regex, replacement));
  console.log(`PATCHED=${rel}|BLOCK=${label}`);
}

const service = "apps/api/src/services/phase7c-lot-settings.service.ts";
replaceExact(service,
`  maxDemoLot: 0.06,\n  maxManagedLot: 0.06,\n  maxTrendLot: 0.06,\n  maxSidewayLot: 0.04,`,
`  maxDemoLot: 1.2,\n  maxManagedLot: 1.2,\n  maxTrendLot: 1.2,\n  maxSidewayLot: 1.2,`);
replaceExact(service,
`  const units = value / PHASE7C_LOT_LIMITS.lotStep;`,
`  const units = value / PHASE7C_LOT_LIMITS.managedLotIncrement;`);
replaceExact(service,
`"Trend fixed lot must be between 0.03 and 0.06 and use 0.03 increments so +10 can close exactly one-third."`,
`"Trend fixed lot must be between 0.03 and 1.20 and use 0.03 increments so +10 can close exactly one-third."`);
replaceExact(service,
`"Sideway max lot must be between 0.03 and 0.04 and use 0.01 broker-step increments; executed Sideway lot remains exact one-third compatible."`,
`"Sideway max lot must be between 0.03 and 1.20 and use 0.03 increments so +10 can close exactly one-third."`);

const lib = "scripts/lib/phase7c-account-mode.ps1";
replaceExact(lib,
`  if ($trend -lt 0.03 -or $trend -gt 0.06) {\n    throw "$Label trendFixedLot must be between 0.03 and 0.06."\n  }\n  if ($maxLot -lt 0.03 -or $maxLot -gt 0.04) {\n    throw "$Label sidewayMaxLot must be between 0.03 and 0.04."\n  }`,
`  if ($trend -lt 0.03 -or $trend -gt 1.20) {\n    throw "$Label trendFixedLot must be between 0.03 and 1.20."\n  }\n  if ($maxLot -lt 0.03 -or $maxLot -gt 1.20) {\n    throw "$Label sidewayMaxLot must be between 0.03 and 1.20."\n  }`);
replaceExact(lib,
`  $sidewayCapUnits = $maxLot / 0.01\n  if ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n    throw "$Label sidewayMaxLot must use 0.01 broker-step increments."\n  }`,
`  $sidewayCapUnits = $maxLot / 0.03\n  if ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n    throw "$Label sidewayMaxLot must use 0.03 increments."\n  }`);

const supervisor = "scripts/run-phase7c-executors-local.ps1";
replaceExact(supervisor,
`if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 0.06) { throw "TrendFixedVolume must be between 0.03 and 0.06." }`,
`if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 1.2) { throw "TrendFixedVolume must be between 0.03 and 1.20." }`);
replaceExact(supervisor,
`if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 0.04) { throw "SidewayMaxLot must be between 0.03 and 0.04." }`,
`if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 1.2) { throw "SidewayMaxLot must be between 0.03 and 1.20." }`);
replaceExact(supervisor, `$sidewayCapUnits = $SidewayMaxLot / 0.01`, `$sidewayCapUnits = $SidewayMaxLot / 0.03`);
replaceExact(supervisor, `throw "SidewayMaxLot must use 0.01 broker-step increments."`, `throw "SidewayMaxLot must use 0.03 increments."`);

const trendLauncher = "scripts/run-phase7c-trend-controller-local.ps1";
replaceExact(trendLauncher,
`if ($FixedVolume -lt 0.03 -or $FixedVolume -gt 0.06) { throw "FixedVolume must be between 0.03 and 0.06." }`,
`if ($FixedVolume -lt 0.03 -or $FixedVolume -gt 1.2) { throw "FixedVolume must be between 0.03 and 1.20." }`);

const sidewayLauncher = "scripts/run-phase7c-sideway-controller-local.ps1";
replaceExact(sidewayLauncher,
`if ($MaxLot -lt 0.03 -or $MaxLot -gt 0.04) { throw "MaxLot must be between 0.03 and 0.04." }`,
`if ($MaxLot -lt 0.03 -or $MaxLot -gt 1.2) { throw "MaxLot must be between 0.03 and 1.20." }`);
replaceExact(sidewayLauncher, `$maxLotUnits = $MaxLot / 0.01`, `$maxLotUnits = $MaxLot / 0.03`);
replaceExact(sidewayLauncher,
`throw "MaxLot cap must use 0.01 broker-step increments; executed Sideway lot remains exact one-third compatible."`,
`throw "MaxLot must use 0.03 increments so +10 can close exactly one-third."`);

replaceExact("scripts/run-phase7b-demo-controller.ts", `const MAX_TREND_FIXED_VOLUME = 0.06;`, `const MAX_TREND_FIXED_VOLUME = 1.2;`);
replaceExact("scripts/run-phase7c-sideway-controller.mjs", `const MAX_SIDEWAY_LOT = 0.04;`, `const MAX_SIDEWAY_LOT = 1.2;`);
replaceExact("scripts/run-phase7c-sideway-controller.mjs", `const maxLotUnits = rawMaxLot / 0.01;`, `const maxLotUnits = rawMaxLot / 0.03;`);
replaceExact("scripts/run-phase7c-sideway-controller.mjs",
`throw new Error("Phase 7C Sideway max lot cap must use 0.01 broker-step increments; executed volume remains exact one-third compatible.");`,
`throw new Error("Phase 7C Sideway max lot must use 0.03 increments so +10 can close exactly one-third.");`);

const activation = "scripts/activate-phase7c-local.ps1";
replaceExact(activation,
`if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 0.06) {\n  throw "TrendFixedVolume must be between 0.03 and 0.06 lot."\n}`,
`if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 1.2) {\n  throw "TrendFixedVolume must be between 0.03 and 1.20 lot."\n}`);
replaceExact(activation,
`if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 0.04) {\n  throw "SidewayMaxLot must be between 0.03 and 0.04 lot as the Auto-Lot cap."\n}\n$sidewayCapUnits = $SidewayMaxLot / 0.01\nif ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n  throw "SidewayMaxLot must use the 0.01 broker step; executed Sideway volume remains exact-one-third compatible through Auto Lot."\n}`,
`if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 1.2) {\n  throw "SidewayMaxLot must be between 0.03 and 1.20 lot."\n}\n$sidewayCapUnits = $SidewayMaxLot / 0.03\nif ([math]::Abs($sidewayCapUnits - [math]::Round($sidewayCapUnits)) -gt 1e-8) {\n  throw "SidewayMaxLot must use 0.03 increments so +10 can close exactly one-third."\n}`);

const web = "apps/web/src/pages/Phase7CControlCenterPage.tsx";
replaceExact(web,
`label="Trend fixed lot" value={trendFixedLot} onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 0.06, step: 0.03 } }}`,
`label="Trend fixed lot" value={trendFixedLot} onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }}`);
replaceExact(web,
`label="Sideway max lot" value={sidewayMaxLot} onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 0.04, step: 0.01 } }}`,
`label="Sideway max lot" value={sidewayMaxLot} onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }}`);

const route = "apps/api/src/routes/phase7c.route.ts";
replaceExact(route,
`    const sidewayCapUnits = sidewayCap / step;\n    if (Math.abs(sidewayCapUnits - Math.round(sidewayCapUnits)) > 1e-8) {\n      throw new Error(\`Sideway max lot \${sidewayCap} is not compatible with broker step \${step}.\`);\n    }`,
`    const sidewayCapUnits = sidewayCap / step;\n    if (Math.abs(sidewayCapUnits - Math.round(sidewayCapUnits)) > 1e-8 || Math.round(sidewayCapUnits) % 3 !== 0) {\n      throw new Error(\`Sideway max lot \${sidewayCap} is not compatible with broker step \${step} and exact one-third partial close.\`);\n    }`);

// Rewrite only the old contract-specific regression blocks; preserve default/risk/Telegram tests.
const regression = "scripts/phase7c-lot-settings.test.mjs";
replaceRegex(regression,
/test\("canonical lot bounds cap Trend at 0\.06 and Sideway cap at 0\.04", \(\) => \{[\s\S]*?\n\}\);\n\ntest\("execution boundaries distinguish Trend managed-lot increments from Sideway cap increments",/,
`test("canonical lot bounds allow Trend and Sideway from 0.03 to 1.20 in 0.03 increments", () => {
  assert.equal(PHASE7C_LOT_LIMITS.maxDemoLot, 1.2);
  assert.equal(PHASE7C_LOT_LIMITS.maxManagedLot, 1.2);
  assert.equal(PHASE7C_LOT_LIMITS.maxTrendLot, 1.2);
  assert.equal(PHASE7C_LOT_LIMITS.maxSidewayLot, 1.2);
  for (const lot of [0.03, 0.06, 0.3, 0.6, 1.17, 1.2]) {
    assert.deepEqual(validatePhase7CLotSettings({ trendFixedLot: lot, sidewayRiskPercent: 0.25, sidewayMaxLot: lot }), {
      trendFixedLot: lot,
      sidewayRiskPercent: 0.25,
      sidewayMaxLot: lot,
    });
  }
  for (const lot of [0.04, 0.05, 1.21, 1.23]) {
    assert.throws(() => validatePhase7CLotSettings({ trendFixedLot: lot, sidewayRiskPercent: 0.25, sidewayMaxLot: 0.03 }), /0\\.03.*1\\.20|0\\.03 increments/i);
    assert.throws(() => validatePhase7CLotSettings({ trendFixedLot: 0.03, sidewayRiskPercent: 0.25, sidewayMaxLot: lot }), /0\\.03.*1\\.20|0\\.03 increments/i);
  }
});

test("execution boundaries enforce the shared 1.20 ceiling and 0.03 increments",`,
"canonical bounds block");

replaceRegex(regression,
/test\("execution boundaries enforce the shared 1\.20 ceiling and 0\.03 increments", \(\) => \{[\s\S]*?\n\}\);\n\ntest\("activation path preserves Trend managed-lot and Sideway cap semantics",/,
`test("execution boundaries enforce the shared 1.20 ceiling and 0.03 increments", () => {
  const supervisor = readFileSync(path.join(scriptsDir, "run-phase7c-executors-local.ps1"), "utf8");
  const trendLauncher = readFileSync(path.join(scriptsDir, "run-phase7c-trend-controller-local.ps1"), "utf8");
  const sidewayLauncher = readFileSync(path.join(scriptsDir, "run-phase7c-sideway-controller-local.ps1"), "utf8");
  const accountModeLibrary = readFileSync(path.join(scriptsDir, "lib", "phase7c-account-mode.ps1"), "utf8");
  const trendController = readFileSync(path.join(scriptsDir, "run-phase7b-demo-controller.ts"), "utf8");
  const sidewayController = readFileSync(path.join(scriptsDir, "run-phase7c-sideway-controller.mjs"), "utf8");
  assert.match(supervisor, /\\$TrendFixedVolume\\s+-gt\\s+1\\.2/);
  assert.match(supervisor, /\\$SidewayMaxLot\\s+-gt\\s+1\\.2/);
  assert.match(supervisor, /\\$TrendFixedVolume\\s*\\/\\s*0\\.03/);
  assert.match(supervisor, /\\$SidewayMaxLot\\s*\\/\\s*0\\.03/);
  assert.match(trendLauncher, /\\$FixedVolume\\s+-gt\\s+1\\.2/);
  assert.match(trendLauncher, /\\$FixedVolume\\s*\\/\\s*0\\.03/);
  assert.match(sidewayLauncher, /\\$MaxLot\\s+-gt\\s+1\\.2/);
  assert.match(sidewayLauncher, /\\$MaxLot\\s*\\/\\s*0\\.03/);
  assert.match(accountModeLibrary, /\\$trend\\s*\\/\\s*0\\.03/);
  assert.match(accountModeLibrary, /\\$maxLot\\s*\\/\\s*0\\.03/);
  assert.match(trendController, /MAX_TREND_FIXED_VOLUME\\s*=\\s*1\\.2/);
  assert.match(sidewayController, /MAX_SIDEWAY_LOT\\s*=\\s*1\\.2/);
  assert.match(sidewayController, /rawMaxLot\\s*\\/\\s*0\\.03/);
});

test("activation path preserves the shared 1.20 step-0.03 contract",`,
"execution boundaries block");

replaceRegex(regression,
/test\("activation path preserves the shared 1\.20 step-0\.03 contract", \(\) => \{[\s\S]*?\n\}\);\n\ntest\("API route keeps exact one-third on Trend but treats Sideway max as a broker-step cap",/,
`test("activation path preserves the shared 1.20 step-0.03 contract", () => {
  const activation = readFileSync(path.join(scriptsDir, "activate-phase7c-local.ps1"), "utf8");
  const safeActivation = readFileSync(path.join(scriptsDir, "activate-phase7c-safe-local.ps1"), "utf8");
  assert.match(activation, /\\$TrendFixedVolume\\s+-gt\\s+1\\.2/);
  assert.match(activation, /\\$SidewayMaxLot\\s+-gt\\s+1\\.2/);
  assert.match(activation, /\\$TrendFixedVolume\\s*\\/\\s*0\\.03/);
  assert.match(activation, /\\$SidewayMaxLot\\s*\\/\\s*0\\.03/);
  assert.match(safeActivation, /\\$activationArgs\\.SidewayMaxLot\\s*=\\s*\\$SidewayMaxLot/);
  assert.match(safeActivation, /PHASE7C_SAFE_ACTIVATE_FINAL_MODE=PAUSE/);
});

test("API route keeps exact one-third compatibility for Trend and Sideway max lot",`,
"activation block");

replaceRegex(regression,
/test\("API route keeps exact one-third compatibility for Trend and Sideway max lot", \(\) => \{[\s\S]*?\n\}\);\n\ntest\("Web lot controls expose the canonical bounds and Sideway cap step",/,
`test("API route keeps exact one-third compatibility for Trend and Sideway max lot", () => {
  const route = readFileSync(path.join(projectRoot, "apps", "api", "src", "routes", "phase7c.route.ts"), "utf8");
  assert.match(route, /Trend fixed lot[^\\n]*exact one-third partial close/s);
  assert.match(route, /Sideway max lot[^\\n]*exact one-third partial close/s);
});

test("Web lot controls expose the shared 1.20 ceiling and 0.03 step",`,
"API broker block");

replaceRegex(regression,
/test\("Web lot controls expose the shared 1\.20 ceiling and 0\.03 step", \(\) => \{[\s\S]*?\n\}\);\n\ntest\("Telegram dry-run preserves journal numeric precision and remains orderPermission=NONE",/,
`test("Web lot controls expose the shared 1.20 ceiling and 0.03 step", () => {
  const web = readFileSync(path.join(projectRoot, "apps", "web", "src", "pages", "Phase7CControlCenterPage.tsx"), "utf8");
  assert.match(web, /label="Trend fixed lot"[\\s\\S]*?min:\\s*0\\.03,\\s*max:\\s*1\\.2,\\s*step:\\s*0\\.03/);
  assert.match(web, /label="Sideway max lot"[\\s\\S]*?min:\\s*0\\.03,\\s*max:\\s*1\\.2,\\s*step:\\s*0\\.03/);
});

test("Telegram dry-run preserves journal numeric precision and remains orderPermission=NONE",`,
"Web controls block");

const forbidden = [
  [service, ["maxTrendLot: 0.06", "maxSidewayLot: 0.04"]],
  [lib, ["$trend -gt 0.06", "$maxLot -gt 0.04", "$maxLot / 0.01"]],
  [supervisor, ["$TrendFixedVolume -gt 0.06", "$SidewayMaxLot -gt 0.04", "$SidewayMaxLot / 0.01"]],
  [trendLauncher, ["$FixedVolume -gt 0.06"]],
  [sidewayLauncher, ["$MaxLot -gt 0.04", "$MaxLot / 0.01"]],
  ["scripts/run-phase7b-demo-controller.ts", ["MAX_TREND_FIXED_VOLUME = 0.06"]],
  ["scripts/run-phase7c-sideway-controller.mjs", ["MAX_SIDEWAY_LOT = 0.04", "rawMaxLot / 0.01"]],
  [activation, ["$TrendFixedVolume -gt 0.06", "$SidewayMaxLot -gt 0.04", "$SidewayMaxLot / 0.01"]],
  [web, ["max: 0.06, step: 0.03", "max: 0.04, step: 0.01"]],
];
for (const [rel, tokens] of forbidden) {
  const text = read(rel);
  for (const token of tokens) if (text.includes(token)) throw new Error(`${rel}: obsolete contract remains: ${token}`);
}

console.log("PHASE7C_LOT_RANGE_120_PATCH_V2=PASS");
