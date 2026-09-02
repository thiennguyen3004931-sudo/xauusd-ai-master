import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

export type Phase7CPerformanceStrategy = "TREND" | "SIDEWAY" | "OTHER";
export type Phase7CPerformanceOwnership = "SYSTEM" | "VALIDATION" | "OTHER";
export type Phase7CRegimeAttributionState = "MATCHED" | "UNMATCHED";

export interface Phase7CPerformanceAttributionTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  ownership: Phase7CPerformanceOwnership;
  strategy: Phase7CPerformanceStrategy;
  openedAt: number;
  volume: number;
}

export interface Phase7CPerformanceAuditRecord {
  timestamp: number;
  strategy: "TREND" | "SIDEWAY";
  symbol?: string;
  event: string;
  setup?: {
    side?: string | null;
    regime?: string | null;
    confidence?: number | null;
  };
  sizing?: {
    finalLot?: number | null;
  };
  raw?: unknown;
}

export interface Phase7CRegimeAttribution {
  regime: string | null;
  regimeConfidence: number | null;
  regimeAttribution: Phase7CRegimeAttributionState;
  regimeSource: string | null;
}

const DEFAULT_MATCH_WINDOW_MS = 60_000;
const VOLUME_EPSILON = 1e-8;

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function expectedEvent(strategy: Phase7CPerformanceStrategy): string | null {
  if (strategy === "TREND") return "ENTRY_FINAL_PERMISSION_GRANTED";
  if (strategy === "SIDEWAY") return "ENTRY_SUBMIT";
  return null;
}

function sourceFor(record: Phase7CPerformanceAuditRecord): string {
  return `${record.strategy}:${record.event}`;
}

function unmatched<T extends Phase7CPerformanceAttributionTrade>(trade: T): T & Phase7CRegimeAttribution {
  return {
    ...trade,
    regime: null,
    regimeConfidence: null,
    regimeAttribution: "UNMATCHED",
    regimeSource: null,
  };
}

function isCandidate(
  trade: Phase7CPerformanceAttributionTrade,
  record: Phase7CPerformanceAuditRecord,
  maxDeltaMs: number,
): boolean {
  if (trade.ownership !== "SYSTEM") return false;
  const event = expectedEvent(trade.strategy);
  if (!event || record.strategy !== trade.strategy || record.event !== event) return false;

  const regime = cleanText(record.setup?.regime);
  const side = cleanText(record.setup?.side)?.toUpperCase();
  const timestamp = finite(record.timestamp);
  const volume = finite(record.sizing?.finalLot);
  if (!regime || timestamp === null || volume === null || side !== trade.side) return false;

  const recordSymbol = cleanText(record.symbol)?.toUpperCase();
  if (recordSymbol && recordSymbol !== trade.symbol.trim().toUpperCase()) return false;
  if (Math.abs(volume - trade.volume) > VOLUME_EPSILON) return false;
  if (Math.abs(timestamp - trade.openedAt) > maxDeltaMs) return false;
  return true;
}

export function enrichPerformanceTradesWithRegimeAttribution<T extends Phase7CPerformanceAttributionTrade>(
  trades: readonly T[],
  auditRows: readonly Phase7CPerformanceAuditRecord[],
  maxDeltaMs = DEFAULT_MATCH_WINDOW_MS,
): Array<T & Phase7CRegimeAttribution> {
  if (!Number.isFinite(maxDeltaMs) || maxDeltaMs < 0) {
    throw new Error("maxDeltaMs must be finite and non-negative.");
  }

  const candidateIndexes = trades.map((trade) => auditRows
    .map((record, index) => isCandidate(trade, record, maxDeltaMs) ? index : -1)
    .filter((index) => index >= 0));

  const eventUsage = new Map<number, number>();
  for (const indexes of candidateIndexes) {
    for (const index of indexes) eventUsage.set(index, (eventUsage.get(index) ?? 0) + 1);
  }

  return trades.map((trade, tradeIndex) => {
    const candidates = candidateIndexes[tradeIndex] ?? [];
    if (candidates.length !== 1) return unmatched(trade);
    const eventIndex = candidates[0]!;
    if ((eventUsage.get(eventIndex) ?? 0) !== 1) return unmatched(trade);

    const record = auditRows[eventIndex]!;
    return {
      ...trade,
      regime: cleanText(record.setup?.regime),
      regimeConfidence: finite(record.setup?.confidence),
      regimeAttribution: "MATCHED",
      regimeSource: sourceFor(record),
    };
  });
}

function runtimeRoot(): string {
  const configured = process.env.PHASE7C_RUNTIME_ROOT?.trim();
  if (configured) return resolve(configured);
  const demoDir = process.env.PHASE7B_DEMO_WORK_DIR?.trim();
  if (demoDir) return resolve(demoDir, "..");
  return resolve(process.cwd(), ".runtime");
}

function decisionAuditRoot(accountMode: "DEMO" | "LIVE"): string {
  const base = resolve(runtimeRoot(), "phase7c-executors", "decision-observability");
  const accountRoot = resolve(base, accountMode.toLowerCase());
  if (accountMode === "LIVE") return accountRoot;
  return existsSync(accountRoot) ? accountRoot : base;
}

function validAuditRecord(value: unknown): value is Phase7CPerformanceAuditRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<Phase7CPerformanceAuditRecord>;
  if (row.strategy !== "TREND" && row.strategy !== "SIDEWAY") return false;
  if (!Number.isFinite(Number(row.timestamp))) return false;
  return row.event === expectedEvent(row.strategy);
}

async function readAuthoritativeRows(file: string): Promise<Phase7CPerformanceAuditRecord[]> {
  if (!existsSync(file)) return [];
  const rows: Phase7CPerformanceAuditRecord[] = [];
  try {
    const input = createReadStream(file, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line) as unknown;
        if (validAuditRecord(value)) {
          rows.push({
            ...value,
            timestamp: Number(value.timestamp),
          });
        }
      } catch {
        // Append-only journals can contain a partial final row during concurrent reads.
      }
    }
  } catch {
    return [];
  }
  return rows;
}

export async function loadPhase7CPerformanceRegimeAuditFromDirectory(
  root: string,
): Promise<Phase7CPerformanceAuditRecord[]> {
  const [trend, sideway] = await Promise.all([
    readAuthoritativeRows(resolve(root, "trend-decisions.jsonl")),
    readAuthoritativeRows(resolve(root, "sideway-decisions.jsonl")),
  ]);
  return [...trend, ...sideway].sort((a, b) => a.timestamp - b.timestamp);
}

export async function loadPhase7CPerformanceRegimeAudit(
  accountMode: "DEMO" | "LIVE",
): Promise<Phase7CPerformanceAuditRecord[]> {
  return loadPhase7CPerformanceRegimeAuditFromDirectory(decisionAuditRoot(accountMode));
}

export const __test = {
  DEFAULT_MATCH_WINDOW_MS,
  decisionAuditRoot,
  isCandidate,
  validAuditRecord,
};
