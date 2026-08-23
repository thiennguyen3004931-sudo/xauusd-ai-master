import fs from "node:fs";

const mode = String(process.env.ZIQ_PHASE7C_ACCOUNT_MODE || "DEMO").trim().toUpperCase();
if (!new Set(["DEMO", "LIVE"]).has(mode)) {
  throw new Error(`Invalid ZIQ_PHASE7C_ACCOUNT_MODE=${mode}`);
}

if (mode === "DEMO") {
  console.log("PHASE7C_TREND_ACCOUNT_MODE=DEMO");
  await import("./run-phase7c-trend-controller.mjs");
} else {
  const liveEnabled = /^(1|true|yes|on)$/i.test(process.env.ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED || "false");
  const allowReal = /^(1|true|yes|on)$/i.test(process.env.MT5_ALLOW_REAL_ACCOUNT || "false");
  const tradingEnabled = /^(1|true|yes|on)$/i.test(process.env.MT5_TRADING_ENABLED || "false");
  const allowedLogins = String(process.env.MT5_ALLOWED_LOGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!liveEnabled) throw new Error("Phase7C LIVE Trend requires ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED=true.");
  if (!allowReal) throw new Error("Phase7C LIVE Trend requires MT5_ALLOW_REAL_ACCOUNT=true.");
  if (!tradingEnabled) throw new Error("Phase7C LIVE Trend requires MT5_TRADING_ENABLED=true.");
  if (allowedLogins.length === 0) throw new Error("Phase7C LIVE Trend requires a non-empty MT5_ALLOWED_LOGINS allowlist.");
  if (!process.env.ZIQ_BRIDGE_ENV?.trim()) throw new Error("Phase7C LIVE Trend requires ZIQ_BRIDGE_ENV to point at the dedicated LIVE env file.");

  const originalReadFileSync = fs.readFileSync.bind(fs);
  let transformed = false;
  fs.readFileSync = function phase7CLiveTrendReadFileSync(file, options) {
    const raw = originalReadFileSync(file, options);
    const filename = typeof file === "string" ? file : file instanceof URL ? file.pathname : String(file);
    if (!filename.replaceAll("\\", "/").endsWith("/run-phase7b-demo-controller.ts")) return raw;

    const source = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    const allowRealMarker = 'if (allowReal) throw new Error("Phase 7B DEMO refuses MT5_ALLOW_REAL_ACCOUNT=true.");';
    const modeMarker = 'health.accountMode !== "demo"';
    if (!source.includes(allowRealMarker) || !source.includes(modeMarker)) {
      throw new Error("Phase7C LIVE Trend adapter markers no longer match legacy controller; refusing LIVE execution.");
    }

    let output = source.replace(
      allowRealMarker,
      'if (!allowReal) throw new Error("Phase 7C LIVE requires MT5_ALLOW_REAL_ACCOUNT=true.");',
    );
    output = output.replaceAll('health.accountMode !== "demo"', 'health.accountMode !== "real"');
    output = output.replaceAll('health.accountMode === "demo"', 'health.accountMode === "real"');
    output = output.replaceAll('requires accountMode=demo', 'requires accountMode=real');
    output = output.replaceAll('MT5 DEMO account login is unavailable.', 'MT5 LIVE account login is unavailable.');
    output = output.replaceAll('Add DEMO login', 'Add LIVE login');
    output = output.replaceAll('Current DEMO login', 'Current LIVE login');
    transformed = true;
    console.log("PHASE7C_TREND_LIVE_ADAPTER=APPLIED");
    return Buffer.isBuffer(raw) ? Buffer.from(output, "utf8") : output;
  };

  console.log("PHASE7C_TREND_ACCOUNT_MODE=LIVE");
  try {
    await import("./run-phase7c-trend-controller.mjs");
    if (!transformed) throw new Error("Phase7C LIVE Trend adapter was not applied; refusing silent fallback.");
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
}
