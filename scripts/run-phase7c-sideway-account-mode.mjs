import fs from "node:fs";

const mode = String(process.env.ZIQ_PHASE7C_ACCOUNT_MODE || "DEMO").trim().toUpperCase();
if (!new Set(["DEMO", "LIVE"]).has(mode)) {
  throw new Error(`Invalid ZIQ_PHASE7C_ACCOUNT_MODE=${mode}`);
}

if (mode === "DEMO") {
  console.log("PHASE7C_SIDEWAY_ACCOUNT_MODE=DEMO");
  await import("./run-phase7c-sideway-controller.mjs");
} else {
  const liveEnabled = /^(1|true|yes|on)$/i.test(process.env.ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED || "false");
  const allowReal = /^(1|true|yes|on)$/i.test(process.env.MT5_ALLOW_REAL_ACCOUNT || "false");
  const tradingEnabled = /^(1|true|yes|on)$/i.test(process.env.MT5_TRADING_ENABLED || "false");
  const allowedLogins = String(process.env.MT5_ALLOWED_LOGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!liveEnabled) throw new Error("Phase7C LIVE Sideway requires ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED=true.");
  if (!allowReal) throw new Error("Phase7C LIVE Sideway requires MT5_ALLOW_REAL_ACCOUNT=true.");
  if (!tradingEnabled) throw new Error("Phase7C LIVE Sideway requires MT5_TRADING_ENABLED=true.");
  if (allowedLogins.length === 0) throw new Error("Phase7C LIVE Sideway requires a non-empty MT5_ALLOWED_LOGINS allowlist.");

  const sourceUrl = new URL("./run-phase7c-sideway-controller.mjs", import.meta.url);
  const source = fs.readFileSync(sourceUrl, "utf8");
  const allowRealMarker = 'if (allowReal) throw new Error("Phase 7C Sideway controller refuses MT5_ALLOW_REAL_ACCOUNT=true.");';
  const modeMarker = 'health.accountMode !== "demo"';
  if (!source.includes(allowRealMarker) || !source.includes(modeMarker)) {
    throw new Error("Phase7C LIVE Sideway adapter markers no longer match controller; refusing LIVE execution.");
  }

  let output = source.replace(
    allowRealMarker,
    'if (!allowReal) throw new Error("Phase 7C LIVE Sideway requires MT5_ALLOW_REAL_ACCOUNT=true.");',
  );
  output = output.replaceAll('health.accountMode !== "demo"', 'health.accountMode !== "real"');
  output = output.replaceAll('health.accountMode === "demo"', 'health.accountMode === "real"');
  output = output.replaceAll('requires accountMode=demo', 'requires accountMode=real');
  output = output.replaceAll('MT5 DEMO account login is unavailable.', 'MT5 LIVE account login is unavailable.');
  output = output.replaceAll('Add DEMO login', 'Add LIVE login');
  output = output.replaceAll('Current DEMO login', 'Current LIVE login');

  const runtimeUrl = new URL(`./.phase7c-sideway-live-runtime-${process.pid}.mjs`, import.meta.url);
  fs.writeFileSync(runtimeUrl, `${output}\n//# sourceURL=${sourceUrl.href}\n`, "utf8");
  console.log("PHASE7C_SIDEWAY_ACCOUNT_MODE=LIVE");
  console.log("PHASE7C_SIDEWAY_LIVE_ADAPTER=APPLIED");
  try {
    await import(`${runtimeUrl.href}?pid=${process.pid}`);
  } finally {
    try { fs.unlinkSync(runtimeUrl); } catch { /* best effort */ }
  }
}
