import fs from "node:fs";
import { installPhase7CAccountOrderFetchGuard } from "./phase7c-account-runtime-guard.mjs";
import { transformPhase7CSidewaySource } from "./phase7c-live-source-adapters.mjs";

const runtime = installPhase7CAccountOrderFetchGuard({ label: "SIDEWAY" });
const mode = runtime.accountMode;

if (mode === "DEMO") {
  console.log("PHASE7C_SIDEWAY_ACCOUNT_MODE=DEMO");
  console.log("PHASE7C_SIDEWAY_ACCOUNT_ORDER_GATE=ENABLED");
  await import("./run-phase7c-sideway-controller.mjs");
} else {
  // Keep the canonical Sideway strategy implementation unchanged. Only its
  // legacy DEMO account guard is adapted into an ephemeral module. Exact
  // source markers make any future drift fail closed instead of silently
  // enabling LIVE execution with an unreviewed controller.
  const sourceUrl = new URL("./run-phase7c-sideway-controller.mjs", import.meta.url);
  const source = fs.readFileSync(sourceUrl, "utf8");
  const output = transformPhase7CSidewaySource(source);
  const runtimeUrl = new URL(`./.phase7c-sideway-live-runtime-${process.pid}.mjs`, import.meta.url);
  fs.writeFileSync(runtimeUrl, `${output}\n//# sourceURL=${sourceUrl.href}\n`, "utf8");

  console.log("PHASE7C_SIDEWAY_ACCOUNT_MODE=LIVE");
  console.log("PHASE7C_SIDEWAY_ACCOUNT_ORDER_GATE=ENABLED");
  console.log("PHASE7C_SIDEWAY_LIVE_ADAPTER=APPLIED");
  try {
    await import(`${runtimeUrl.href}?pid=${process.pid}`);
  } finally {
    try { fs.unlinkSync(runtimeUrl); } catch { /* best effort */ }
  }
}
