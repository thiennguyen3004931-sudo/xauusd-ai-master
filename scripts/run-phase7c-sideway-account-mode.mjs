import fs from "node:fs";
import { installPhase7CAccountOrderFetchGuard } from "./phase7c-account-runtime-guard.mjs";
import { transformPhase7CSidewaySource } from "./phase7c-live-source-adapters.mjs";
import { transformPhase7CSidewayCanonicalDailyRecoverySource } from "./phase7c-canonical-daily-recovery-source-adapter.mjs";

const runtime = installPhase7CAccountOrderFetchGuard({ label: "SIDEWAY" });
const mode = runtime.accountMode;
const sourceUrl = new URL("./run-phase7c-sideway-controller.mjs", import.meta.url);
const source = fs.readFileSync(sourceUrl, "utf8");
const accountAdapted = mode === "LIVE"
  ? transformPhase7CSidewaySource(source)
  : source;
const output = transformPhase7CSidewayCanonicalDailyRecoverySource(accountAdapted);
const runtimeUrl = new URL(`./.phase7c-sideway-runtime-${process.pid}.mjs`, import.meta.url);
fs.writeFileSync(runtimeUrl, `${output}\n//# sourceURL=${sourceUrl.href}\n`, "utf8");

console.log(`PHASE7C_SIDEWAY_ACCOUNT_MODE=${mode}`);
console.log("PHASE7C_SIDEWAY_ACCOUNT_ORDER_GATE=ENABLED");
console.log(`PHASE7C_SIDEWAY_CANONICAL_DAILY_RECOVERY_ADAPTER=APPLIED|MODE=${mode}`);
if (mode === "LIVE") console.log("PHASE7C_SIDEWAY_LIVE_ADAPTER=APPLIED");
try {
  await import(`${runtimeUrl.href}?pid=${process.pid}`);
} finally {
  try { fs.unlinkSync(runtimeUrl); } catch { /* best effort */ }
}
