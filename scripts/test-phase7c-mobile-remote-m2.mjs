import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");

function readRequired(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`M2 RED: required file is missing: ${relativePath}`);
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`M2 contract missing ${label}: ${needle}`);
}

function requireOrder(content, first, second, label) {
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`M2 contract ordering violation: ${label}`);
  }
}

function forbid(content, pattern, label) {
  if (pattern.test(content)) throw new Error(`M2 safety violation: ${label}`);
}

const gateway = readRequired("scripts/run-phase7c-mobile-readonly-gateway.mjs");
const start = readRequired("scripts/start-phase7c-mobile-remote-tailscale-local.ps1");
const stop = readRequired("scripts/stop-phase7c-mobile-remote-tailscale-local.ps1");

requireText(gateway, 'const BIND_HOST = "127.0.0.1"', "loopback-only gateway bind");
requireText(gateway, 'new Set(["GET", "HEAD"])', "GET/HEAD-only method gate");
requireText(gateway, '"/phase7c-mobile"', "mobile page allowlist");
requireText(gateway, '"/assets/"', "built asset allowlist");
requireText(gateway, '"/favicon.svg"', "favicon allowlist");
requireText(gateway, '"/phase7c-vi-user.js"', "localization asset allowlist");
requireText(gateway, '"/api/v1/mt5/status"', "MT5 read-only status API");
requireText(gateway, '"/api/v1/phase7c/decision-monitor/mt5"', "decision-monitor read-only API");
requireText(gateway, '"/api/v1/phase7c-ui"', "semantic UI read-only API");
requireText(gateway, '"/api/v1/phase7c/lifecycle"', "lifecycle read-only API");
requireText(gateway, '"/api/v1/phase7c/account-risk"', "account-risk read-only API");
requireText(gateway, '"/api/v1/phase7c/lot-settings"', "lot-settings read-only API");
requireText(gateway, '"/api/v1/phase7c-account-switch/same-mode-readiness"', "account readiness read-only API");
requireText(gateway, '"/api/v1/phase7c-live-arm-control/capability"', "LIVE ARM capability read-only API");
requireText(gateway, '"/api/v1/phase7c/runtime-source-attestation"', "runtime attestation read-only API");
requireText(gateway, "405", "mutation-method rejection");
requireText(gateway, "403", "path allowlist rejection");
requireText(gateway, 'server.on("upgrade"', "WebSocket rejection hook");
requireText(gateway, "socket.destroy()", "WebSocket fail-closed behavior");

forbid(gateway, /0\.0\.0\.0/, "gateway must never bind all interfaces");
forbid(gateway, /\bfunnel\b/i, "gateway must not reference Tailscale Funnel");
forbid(gateway, /child_process|execFile|spawn\s*\(/, "gateway must not launch control/runtime commands");

requireText(start, '"127.0.0.1"', "start script loopback target");
requireText(start, "run-phase7c-mobile-readonly-gateway.mjs", "dedicated gateway launcher");
requireText(start, "serve", "Tailscale Serve command");
requireText(start, "--bg", "persistent private Serve mode");
requireText(start, "--https=", "dedicated Tailscale HTTPS port");
requireText(start, "phase7c-mobile", "mobile preflight path");
requireText(start, "PHASE7C_MOBILE_REMOTE_M2_SERVE_PORT_PREFLIGHT=PASS", "Serve listener collision preflight");
requireText(start, "PHASE7C_MOBILE_REMOTE_M2_DNS_FAIL_ROLLBACK=PASS", "post-Serve DNS failure rollback proof");
forbid(start, /\bfunnel\b/i, "start script must never enable Funnel");
forbid(start, /0\.0\.0\.0/, "start script must never expose wildcard bind");
forbid(start, /Start-ScheduledTask|Stop-ScheduledTask|Set-ScheduledTask|Register-ScheduledTask|Unregister-ScheduledTask/i, "start script must not mutate canonical scheduled tasks");
forbid(start, /taskkill\.exe|run-phase7c-executors|trend-executor|sideway-executor/i, "start script must not touch trading processes");

requireText(stop, "serve status --json", "rollback Serve ownership preflight");
requireText(stop, "PHASE7C_MOBILE_REMOTE_M2_SERVE_OWNERSHIP=PASS", "rollback Serve ownership proof");
requireText(stop, "serve", "targeted Tailscale Serve disable");
requireText(stop, "--https=", "targeted remote HTTPS listener disable");
requireText(stop, "off", "Serve disable action");
requireText(stop, "run-phase7c-mobile-readonly-gateway.mjs", "owned gateway process provenance guard");
requireOrder(
  stop,
  "PHASE7C_MOBILE_REMOTE_M2_SERVE_OWNERSHIP=PASS",
  "& $tailscale.Source serve $httpsArg off",
  "Serve ownership must be proven before targeted disable",
);
forbid(stop, /\bserve\s+reset\b/i, "rollback must not reset unrelated Serve configuration");
forbid(stop, /\bfunnel\b/i, "rollback must never manage Funnel");
forbid(stop, /Start-ScheduledTask|Stop-ScheduledTask|Set-ScheduledTask|Register-ScheduledTask|Unregister-ScheduledTask/i, "rollback must not mutate canonical scheduled tasks");
forbid(stop, /taskkill\.exe|run-phase7c-executors|trend-executor|sideway-executor/i, "rollback must not touch trading processes");

console.log("PHASE7C_MOBILE_REMOTE_M2_SOURCE_CONTRACT=PASS");
console.log("TAILSCALE_SCOPE=TAILNET_ONLY");
console.log("HTTP_METHODS=GET_HEAD_ONLY");
console.log("PUBLIC_FUNNEL=FORBIDDEN");
console.log("CANONICAL_TASK_MUTATION=NONE");
console.log("TRADING_PROCESS_MUTATION=NONE");
console.log(`NODE=${process.version}`);
