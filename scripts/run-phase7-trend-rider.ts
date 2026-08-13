import fs from "node:fs";
import { Phase7TrendRiderService } from "@xauusd/risk-engine";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

const m15Path = requiredEnv("ZIQ_M15_JSON");
const m5Path = requiredEnv("ZIQ_M5_JSON");
const metaPath = requiredEnv("ZIQ_META_JSON");
const maxRiskUsd = Number(process.env.ZIQ_MAX_RISK_USD ?? "10");

const m15 = readJson<any[]>(m15Path);
const m5 = readJson<any[]>(m5Path);
const meta = readJson<Record<string, unknown>>(metaPath);
const tickSize = Number(meta.tickSize);
const tickValuePerLot = Number(meta.effectiveTickValuePerLot);
const minVolume = Number(meta.minVolume ?? 0.01);
const volumeStep = Number(meta.volumeStep ?? minVolume);

if (!Array.isArray(m15) || !Array.isArray(m5)) {
  throw new Error("Phase 7 inputs must be JSON arrays.");
}
if (![tickSize, tickValuePerLot, minVolume, volumeStep, maxRiskUsd].every((v) => Number.isFinite(v) && v > 0)) {
  throw new Error("Phase 7 metadata/risk inputs are invalid.");
}
if (Math.abs(maxRiskUsd - 10) > 1e-9) {
  throw new Error("Phase 7 research risk cap is locked at USD 10.");
}

const service = new Phase7TrendRiderService();
const result = service.run({
  m15Bars: m15,
  m5Bars: m5,
  riskCapUsd: maxRiskUsd,
  tickSize,
  tickValuePerLot,
  minVolume,
  volumeStep,
});

for (const line of service.format(result)) console.log(line);
console.log(`PHASE7_INPUT_M15=${m15Path}`);
console.log(`PHASE7_INPUT_M5=${m5Path}`);
console.log(`PHASE7_BROKER_MIN_VOLUME=${minVolume}`);
console.log(`PHASE7_BROKER_VOLUME_STEP=${volumeStep}`);
console.log("PHASE7_VALIDATION_STATUS=RESEARCH_REPLAY_NOT_INDEPENDENT_HOLDOUT");
console.log("PHASE7_DRIVER=STANDALONE");
