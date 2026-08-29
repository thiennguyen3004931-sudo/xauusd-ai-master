import fs from "node:fs";
import path from "node:path";
import type { Mt5BridgeDeal } from "../models/Mt5BridgeDeal";

export interface CanonicalDealRecord extends Mt5BridgeDeal {
  account: string;
  netPnl: number;
}

export interface CanonicalDealLedgerOptions {
  storagePath: string;
}

export interface CanonicalDealSummaryQuery {
  account: string;
  symbol: string;
  ownedMagics: Iterable<number>;
  from: number;
  to: number;
}

export interface CanonicalPositionClosingDealsQuery {
  account: string;
  positionId: string;
  symbol: string;
  ownedMagics: Iterable<number>;
}

export interface CanonicalDealLedgerSummary {
  dealCount: number;
  dailyNetPnl: number;
}

interface PersistedCanonicalDealLedger {
  version: 1;
  deals: CanonicalDealRecord[];
}

const CLOSING_ENTRIES = new Set<Mt5BridgeDeal["entry"]>([
  "OUT",
  "INOUT",
  "OUT_BY",
]);

export class CanonicalDealLedger {
  readonly #storagePath: string;
  readonly #dealsByIdentity = new Map<string, CanonicalDealRecord>();

  constructor(options: CanonicalDealLedgerOptions) {
    const storagePath = String(options?.storagePath ?? "").trim();
    if (!storagePath) {
      throw new Error("CanonicalDealLedger storagePath is required");
    }

    this.#storagePath = storagePath;
    this.#restore();
  }

  get size(): number {
    return this.#dealsByIdentity.size;
  }

  mergeBackfill(
    account: string,
    deals: readonly Mt5BridgeDeal[],
  ): { inserted: number; total: number } {
    const normalizedAccount = requireText(account, "account");
    let inserted = 0;

    for (const deal of deals) {
      const normalized = canonicalizeDeal(normalizedAccount, deal);
      const identity = dealIdentity(normalized.account, normalized.ticket);
      if (this.#dealsByIdentity.has(identity)) {
        continue;
      }

      this.#dealsByIdentity.set(identity, normalized);
      inserted += 1;
    }

    if (inserted > 0) {
      this.#persist();
    }

    return { inserted, total: this.size };
  }

  deals(): CanonicalDealRecord[] {
    return Array.from(this.#dealsByIdentity.values())
      .map((deal) => ({ ...deal }))
      .sort(compareDeals);
  }

  summarize(query: CanonicalDealSummaryQuery): CanonicalDealLedgerSummary {
    const ownedMagics = new Set(
      Array.from(query.ownedMagics, (magic) => Number(magic)),
    );
    let dealCount = 0;
    let dailyNetPnl = 0;

    for (const deal of this.#dealsByIdentity.values()) {
      if (
        deal.account !== query.account ||
        deal.symbol !== query.symbol ||
        deal.isTradingDeal !== true ||
        !ownedMagics.has(Number(deal.magic)) ||
        deal.timestamp < query.from ||
        deal.timestamp >= query.to
      ) {
        continue;
      }

      dealCount += 1;
      dailyNetPnl += deal.netPnl;
    }

    return {
      dealCount,
      dailyNetPnl: normalizeNumber(dailyNetPnl),
    };
  }

  realizedClosingDeals(
    query: CanonicalPositionClosingDealsQuery,
  ): CanonicalDealRecord[] {
    const ownedMagics = new Set(
      Array.from(query.ownedMagics, (magic) => Number(magic)),
    );

    return Array.from(this.#dealsByIdentity.values())
      .filter(
        (deal) =>
          deal.account === query.account &&
          deal.positionId === query.positionId &&
          deal.symbol === query.symbol &&
          deal.isTradingDeal === true &&
          ownedMagics.has(Number(deal.magic)) &&
          CLOSING_ENTRIES.has(deal.entry),
      )
      .map((deal) => ({ ...deal }))
      .sort(compareDeals);
  }

  #restore(): void {
    if (!fs.existsSync(this.#storagePath)) {
      return;
    }

    const raw = fs.readFileSync(this.#storagePath, "utf8").trim();
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedCanonicalDealLedger>;
    if (parsed.version !== 1 || !Array.isArray(parsed.deals)) {
      throw new Error("Unsupported canonical deal ledger state");
    }

    for (const persisted of parsed.deals) {
      const account = requireText(persisted?.account, "account");
      const normalized = canonicalizeDeal(account, persisted);
      this.#dealsByIdentity.set(
        dealIdentity(normalized.account, normalized.ticket),
        normalized,
      );
    }
  }

  #persist(): void {
    fs.mkdirSync(path.dirname(this.#storagePath), { recursive: true });
    const tempPath = `${this.#storagePath}.${process.pid}.tmp`;
    const payload: PersistedCanonicalDealLedger = {
      version: 1,
      deals: this.deals(),
    };

    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, this.#storagePath);
  }
}

function canonicalizeDeal(
  account: string,
  deal: Mt5BridgeDeal,
): CanonicalDealRecord {
  const ticket = requireText(deal?.ticket, "ticket");
  const profit = finiteNumber(deal?.profit);
  const commission = finiteNumber(deal?.commission);
  const swap = finiteNumber(deal?.swap);
  const fee = finiteNumber(deal?.fee);

  return {
    ...deal,
    account,
    ticket,
    profit,
    commission,
    swap,
    fee,
    netPnl: normalizeNumber(profit + commission + swap + fee),
  };
}

function dealIdentity(account: string, ticket: string): string {
  return `${account}\u0000${ticket}`;
}

function compareDeals(
  left: CanonicalDealRecord,
  right: CanonicalDealRecord,
): number {
  return (
    Number(left.timestamp) - Number(right.timestamp) ||
    left.ticket.localeCompare(right.ticket) ||
    left.account.localeCompare(right.account)
  );
}

function finiteNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e10) / 1e10;
}

function requireText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`CanonicalDealLedger ${field} is required`);
  }
  return text;
}
