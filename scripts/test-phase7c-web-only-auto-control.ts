import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPhase7CAutoActivationSourceAllowed,
} from "../apps/api/src/services/phase7c-bot-mode.service.ts";
import {
  telegramModeForCallback,
  telegramModeForCommand,
} from "./phase7c-telegram-mode-logic.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

// The main Control Center owns fail-safe PAUSE only. AUTO lives in one guarded authorization card.
const pageSource = read("apps/web/src/pages/Phase7CControlCenterPage.tsx");
assert.match(pageSource, /setPhase7CBotMode/);
assert.match(pageSource, /mutationFn:\s*\(\)\s*=>\s*setPhase7CBotMode\(["']PAUSE["']\)/);
assert.match(pageSource, /onClick=\{\(\)\s*=>\s*botModeAction\.mutate\(\)\}/);
assert.doesNotMatch(pageSource, /setPhase7CBotMode\(["']AUTO["']\)/);
assert.doesNotMatch(pageSource, /botModeAction\.mutate\(["']AUTO["']\)/);

const authorizationSource = read("apps/web/src/ui/Phase7CExecutionAuthorizationCard.tsx");
assert.match(authorizationSource, /enablePhase7CAuto/);
assert.match(authorizationSource, /mutationFn:\s*enablePhase7CAuto/);
assert.match(authorizationSource, /onClick=\{\(\)\s*=>\s*autoMutation\.mutate\(\)\}/);

// PAUSE is the fail-safe mode and must remain available even when executors are not running.
const pauseStart = pageSource.indexOf("const canPause =");
const pauseEnd = pageSource.indexOf("return (", pauseStart);
assert.ok(pauseStart >= 0 && pauseEnd > pauseStart, "cannot isolate canPause source");
const canPauseSource = pageSource.slice(pauseStart, pauseEnd);
assert.match(canPauseSource, /controlEnabled\s*===\s*true/);
assert.match(canPauseSource, /mode\s*!==\s*["']PAUSE["']/);
assert.doesNotMatch(canPauseSource, /\.running\s*===\s*true/);

// Lifecycle start must never enable AUTO as a side effect. Starting executors ends in PAUSE.
const lifecycleSource = read("apps/api/src/services/phase7c-lifecycle.service.ts");
assert.doesNotMatch(lifecycleSource, /phase7CBotModeService\.set\(\s*["']AUTO["']/);
assert.match(lifecycleSource, /web-control-center-ready-pause/);

// API route must enforce the Web-only AUTO policy, not rely solely on Telegram UI behavior.
const routeSource = read("apps/api/src/routes/phase7c.route.ts");
assert.match(routeSource, /isPhase7CAutoActivationSourceAllowed/);
assert.match(routeSource, /requestedMode\s*===\s*["']AUTO["']/);

console.log("PHASE7C_WEB_ONLY_AUTO_CONTROL_TEST=PASS");
