import fs from "node:fs";
import { installPhase7CAccountOrderFetchGuard } from "./phase7c-account-runtime-guard.mjs";
import { transformPhase7CTrendLegacySource } from "./phase7c-live-source-adapters.mjs";

const runtime = installPhase7CAccountOrderFetchGuard({ label: "TREND" });
const mode = runtime.accountMode;

if (mode === "DEMO") {
  console.log("PHASE7C_TREND_ACCOUNT_MODE=DEMO");
  console.log("PHASE7C_TREND_ACCOUNT_ORDER_GATE=ENABLED");
  await import("./run-phase7c-trend-controller.mjs");
} else {
  if (!process.env.ZIQ_BRIDGE_ENV?.trim()) {
    throw new Error("Phase7C LIVE Trend requires ZIQ_BRIDGE_ENV to point at the dedicated LIVE env file.");
  }

  // Keep the canonical Trend strategy implementation byte-for-byte unchanged.
  // Only its legacy DEMO account guard is adapted in memory. Marker checks make
  // this fail closed if the canonical source changes unexpectedly.
  const originalReadFileSync = fs.readFileSync.bind(fs);
  let transformed = false;
  fs.readFileSync = function phase7CLiveTrendReadFileSync(file, options) {
    const raw = originalReadFileSync(file, options);
    const filename = typeof file === "string" ? file : file instanceof URL ? file.pathname : String(file);
    if (!filename.replaceAll("\\", "/").endsWith("/run-phase7b-demo-controller.ts")) return raw;

    const source = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    const output = transformPhase7CTrendLegacySource(source);
    transformed = true;
    console.log("PHASE7C_TREND_LIVE_ADAPTER=APPLIED");
    return Buffer.isBuffer(raw) ? Buffer.from(output, "utf8") : output;
  };

  console.log("PHASE7C_TREND_ACCOUNT_MODE=LIVE");
  console.log("PHASE7C_TREND_ACCOUNT_ORDER_GATE=ENABLED");
  try {
    await import("./run-phase7c-trend-controller.mjs");
    if (!transformed) {
      throw new Error("Phase7C LIVE Trend adapter was not applied; refusing silent fallback.");
    }
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
}
