import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isPhase7CAutoActivationSourceAllowed,
} from "../apps/api/src/services/phase7c-bot-mode.service.ts";
import {
  telegramModeForCallback,
  telegramModeForCommand,
} from "./phase7c-telegram-mode-logic.mjs";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

// AUTO is a privileged transition: only the dedicated Web control may activate it.
assert.equal(isPhase7CAutoActivationSourceAllowed("web-control-center"), true);
assert.equal(isPhase7CAutoActivationSourceAllowed("telegram"), false);
assert.equal(isPhase7CAutoActivationSourceAllowed("telegram-command"), false);
assert.equal(isPhase7CAutoActivationSourceAllowed("startup-scheduled-task"), false);
assert.equal(isPhase7CAutoActivationSourceAllowed("web-control-center-start"), false);

// Telegram keeps safety/manual strategy controls, but cannot activate AUTO.
assert.equal(telegramModeForCommand("/pause"), "PAUSE");
assert.equal(telegramModeForCommand("/tamdung"), "PAUSE");
assert.equal(telegramModeForCommand("/trend"), "TREND");
assert.equal(telegramModeForCommand("/sideway"), "SIDEWAY");
assert.equal(telegramModeForCommand("/auto"), null);
assert.equal(telegramModeForCommand("/tudong"), null);
assert.equal(telegramModeForCallback("p7c:PAUSE"), "PAUSE");
assert.equal(telegramModeForCallback("p7c:TREND"), "TREND");
assert.equal(telegramModeForCallback("p7c:SIDEWAY"), "SIDEWAY");
assert.equal(telegramModeForCallback("p7c:AUTO"), null);

const apiSource = read("apps/web/src/api.ts");
assert.match(apiSource, /export async function setPhase7CBotMode/);
assert.match(apiSource, /\/api\/v1\/phase7c\/bot-mode/);
assert.match(apiSource, /source:\s*["']web-control-center["']/);

const pageSource = read("apps/web/src/pages/Phase7CControlCenterPage.tsx");
assert.match(pageSource, /setPhase7CBotMode/);
assert.match(pageSource, /mutationFn:\s*setPhase7CBotMode/);
assert.match(pageSource, /botModeAction\.mutate\(["']PAUSE["']\)/);
assert.match(pageSource, /botModeAction\.mutate\(["']AUTO["']\)/);

// Lifecycle start must never enable AUTO as a side effect. Starting executors ends in PAUSE.
const lifecycleSource = read("apps/api/src/services/phase7c-lifecycle.service.ts");
assert.doesNotMatch(lifecycleSource, /phase7CBotModeService\.set\(\s*["']AUTO["']/);
assert.match(lifecycleSource, /web-control-center-ready-pause/);

// API route must enforce the Web-only AUTO policy, not rely solely on Telegram UI behavior.
const routeSource = read("apps/api/src/routes/phase7c.route.ts");
assert.match(routeSource, /isPhase7CAutoActivationSourceAllowed/);
assert.match(routeSource, /requestedMode\s*===\s*["']AUTO["']/);

console.log("PHASE7C_WEB_ONLY_AUTO_CONTROL_TEST=PASS");
