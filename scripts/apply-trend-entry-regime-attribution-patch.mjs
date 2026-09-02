import fs from "node:fs";

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
  return source.replace(before, after);
}

const wrapperPath = "scripts/run-phase7c-trend-controller.mjs";
let wrapper = fs.readFileSync(wrapperPath, "utf8");

wrapper = replaceExact(
  wrapper,
  'import { evaluateAutoTrendEntryModeGate } from "./phase7c-trend-mode-gate.mjs";\n',
  'import { evaluateAutoTrendEntryModeGate } from "./phase7c-trend-mode-gate.mjs";\n' +
    'import { createPhase7CDecisionAudit } from "./phase7c-decision-audit.mjs";\n' +
    'import { recordTrendEntryAttributionBestEffort } from "./phase7c-trend-entry-attribution.mjs";\n',
  "wrapper imports",
);

wrapper = replaceExact(
  wrapper,
  'const regimeCandleCount = clampInt(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);\n',
  'const regimeCandleCount = clampInt(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);\n' +
    'const trendFinalPermissionAudit = createPhase7CDecisionAudit({\n' +
    '  strategy: "TREND",\n' +
    '  symbol: regimeSymbol,\n' +
    '});\n',
  "wrapper audit initialization",
);

wrapper = replaceExact(
  wrapper,
  '    console.log(\n' +
    '      `PHASE7C_TREND_ENTRY_ALLOWED=MODE_${decision.activeMode}|RECOMMENDED_${decision.recommendedMode ?? "N/A"}|REASON_${decision.reason}`,\n' +
    '    );\n' +
    '    return await nativeFetch(input, init);\n',
  '    recordTrendEntryAttributionBestEffort({\n' +
    '      audit: trendFinalPermissionAudit,\n' +
    '      decision,\n' +
    '      requestBody: request.body,\n' +
    '    });\n\n' +
    '    console.log(\n' +
    '      `PHASE7C_TREND_ENTRY_ALLOWED=MODE_${decision.activeMode}|RECOMMENDED_${decision.recommendedMode ?? "N/A"}|REASON_${decision.reason}`,\n' +
    '    );\n' +
    '    return await nativeFetch(input, init);\n',
  "wrapper final attribution",
);

wrapper = replaceExact(
  wrapper,
  '    headers: new Headers(init?.headers ?? (isRequest ? input.headers : undefined)),\n' +
    '  };\n',
  '    headers: new Headers(init?.headers ?? (isRequest ? input.headers : undefined)),\n' +
    '    body: typeof init?.body === "string" ? init.body : null,\n' +
    '  };\n',
  "wrapper request body observation",
);

fs.writeFileSync(wrapperPath, wrapper, "utf8");

const auditPath = "scripts/phase7c-decision-audit.mjs";
let audit = fs.readFileSync(auditPath, "utf8");
audit = replaceExact(
  audit,
  '  ["ENTRY_SUBMIT", "SUBMITTED"],\n',
  '  ["ENTRY_SUBMIT", "SUBMITTED"],\n' +
    '  ["ENTRY_FINAL_PERMISSION_GRANTED", "READY"],\n',
  "decision audit stage",
);
fs.writeFileSync(auditPath, audit, "utf8");

console.log("TREND_ENTRY_REGIME_ATTRIBUTION_PATCH=APPLIED");
