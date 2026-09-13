import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(import.meta.url);

const contract = require(path.join(root, "apps/mobile-gateway/m4-contract.cjs"));
const { createCanonicalClient } = require(path.join(root, "apps/mobile-gateway/canonical-client.cjs"));
const { validateProductionConfig } = require(path.join(root, "apps/mobile-gateway/gateway.js"));

const EXPECTED_ACTIONS = [
  "MODE_AUTO",
  "MODE_SEMI",
  "MODE_TREND",
  "MODE_SIDEWAY",
  "MODE_PAUSE",
  "ARM_LIVE",
  "DISARM_LIVE",
];

assert.deepEqual([...contract.REMOTE_ACTIONS], EXPECTED_ACTIONS, "remote action allowlist drift");

const runtimeFiles = [
  "apps/mobile-gateway/server.cjs",
  "apps/mobile-gateway/gateway.js",
  "apps/mobile-gateway/m4-contract.cjs",
  "apps/mobile-gateway/canonical-client.cjs",
  "apps/mobile-gateway/transaction-store.cjs",
  "apps/mobile-gateway/audit.cjs",
  "apps/mobile-gateway/m4-action-broker.cjs",
].map((relative) => [relative, fs.readFileSync(path.join(root, relative), "utf8")]);

const serverSource = Object.fromEntries(runtimeFiles)["apps/mobile-gateway/server.cjs"];
assert.match(serverSource, /tailscale-user-login/i, "Tailscale identity header missing");
assert.match(serverSource, /\/__m4\/action/, "bounded M4 mutation route missing");
assert.doesNotMatch(serverSource, /listen\([^\n]*0\.0\.0\.0/, "non-loopback gateway bind introduced");

const webClient = fs.readFileSync(path.join(root, "apps/web/src/mobile-m4-control.ts"), "utf8");
assert.match(webClient, /\/__m4\/action/);
assert.match(webClient, /\/__m4\/state/);
assert.match(webClient, /\/__m4\/status/);
assert.doesNotMatch(webClient, /127\.0\.0\.1:3711/);
assert.doesNotMatch(webClient, /local-control-request/);

for (const forbidden of ["LIFECYCLE_START", "LIFECYCLE_STOP", "ORDER_BUY", "ORDER_SELL", "POSITION_CLOSE", "ACCOUNT_SWITCH", "LOT_SET"]) {
  assert.throws(() => contract.parseActionBody({ action: forbidden }), /UNSUPPORTED_ACTION/);
}

const calls = [];
const fetchImpl = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ approved: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const canonical = createCanonicalClient({
  apiOrigin: "http://127.0.0.1:3711",
  fetchImpl,
  timeoutMs: 1000,
});

await canonical.executeModeAction("MODE_AUTO");
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "http://127.0.0.1:3711/api/v1/phase7c-auto-activation/enable");
assert.equal(calls[0].url.includes("/phase7c/bot-mode"), false, "AUTO must not call bot-mode directly");

calls.length = 0;
await canonical.getAutoStatus();
assert.equal(calls[0].url, "http://127.0.0.1:3711/api/v1/phase7c-auto-activation/status");

calls.length = 0;
await canonical.executeModeAction("MODE_TREND");
assert.equal(calls[0].url, "http://127.0.0.1:3711/api/v1/phase7c/bot-mode");
assert.deepEqual(JSON.parse(calls[0].init.body), { mode: "TREND", source: "mobile-control-center" });

const validConfig = {
  listenHost: "127.0.0.1",
  listenPort: 5791,
  webOrigin: "http://127.0.0.1:5717",
  apiOrigin: "http://127.0.0.1:3711",
  allowedUsers: ["operator@example.com"],
  allowedOrigin: "https://device.tailnet.example:8443",
  auditPath: "C:\\ProgramData\\XAUUSD-AI-MASTER\\mobile-readonly-gateway\\m4-audit.jsonl",
};
assert.doesNotThrow(() => validateProductionConfig(validConfig));
assert.throws(() => validateProductionConfig({ ...validConfig, listenHost: "0.0.0.0" }), /LOOPBACK/);
assert.throws(() => validateProductionConfig({ ...validConfig, apiOrigin: "http://0.0.0.0:3711" }), /API_ORIGIN/);
assert.throws(() => validateProductionConfig({ ...validConfig, webOrigin: "http://0.0.0.0:5717" }), /WEB_ORIGIN/);

for (const [relative, source] of runtimeFiles) {
  assert.doesNotMatch(source, /tailscale\s+funnel\s+(on|enable)/i, `${relative}: Funnel enablement forbidden`);
  assert.doesNotMatch(source, /0\.0\.0\.0:3711|0\.0\.0\.0:8765/, `${relative}: remote API/MT5 exposure forbidden`);
}

console.log("PHASE7C_MOBILE_M4A_SOURCE_CONTRACT=PASS");
