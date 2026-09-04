import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getMt5PerformanceSnapshot,
  type Mt5PerformanceTrade,
} from "./mt5-performance.service";

type Strategy = "TREND" | "SIDEWAY";
type CorrelationVerdict = "EXACT" | "AMBIGUOUS" | "UNMATCHED";
type EntryType = "IMMEDIATE" | "PULLBACK" | "RECOVERY" | "UNKNOWN";
type IdentifierKind = "POSITION" | "ORDER" | "SIGNAL";
type RawEvent = Record<string, unknown>;

const AUDIT_SOURCES = [
  { strategy: "TREND" as const, fileName: "trend-decisions.jsonl" },
  { strategy: "SIDEWAY" as const, fileName: "sideway-decisions.jsonl" },
] as const;

const POSITION_KEYS = new Set([
  "positionid",
  "position_id",
  "positionticket",
  "position_ticket",
]);
const ORDER_KEYS = new Set([
  "orderid",
  "order_id",
  "clientorderid",
  "client_order_id",
  "idempotencykey",
  "idempotency_key",
]);
const SIGNAL_KEYS = new Set(["signalid", "signal_id"]);
const ENTRY_TICKET_EVENTS = new Set([
  "ENTRY_FILLED",
  "ENTRY_ACCEPTED_POSITION_NOT_RESOLVED",
  "PENDING_ENTRY_RECOVERED",
  "POSITION_OPENED",
  "POSITION_RESOLVED",
]);
const PASS_KEYS = new Set(["passedrules", "passed_rules", "rulespassed", "rules_passed"]);
const BLOCK_KEYS = new Set([
  "blockedrules",
  "blocked_rules",
  "failedrules",
  "failed_rules",
  "failedconditions",
  "failed_conditions",
  "blockedby",
  "blocked_by",
]);
const CHECK_CONTAINER_KEYS = new Set([
  "checks",
  "rulechecks",
  "rule_checks",
  "strategyconditions",
  "strategy_conditions",
]);

interface AuditIdentifier {
  kind: IdentifierKind;
  field: string;
  value: string;
  token: string;
}

interface ParsedAuditEvent {
  raw: RawEvent;
  index: number;
  eventId: string;
  eventName: string;
  identifiers: AuditIdentifier[];
  passedRules: string[];
  blockedRules: string[];
  entryType: EntryType;
  regime: string | null;
}

interface ParsedAuditSource {
  strategy: Strategy;
  relativePath: string;
  available: boolean;
  parsedRows: number;
  malformedRows: number;
  events: ParsedAuditEvent[];
}

export interface Phase7CPerformanceCorrelation {
  verdict: CorrelationVerdict;
  method: "EXPLICIT_IDENTITY_GRAPH" | "NONE";
  evidence: string[];
}

export interface Phase7CPerformanceAttribution {
  entryType: EntryType;
  regime: string | null;
  passedRules: string[];
  blockedRules: string[];
  decisionEventIds: string[];
}

export interface Phase7CPerformanceIntelligenceTrade extends Mt5PerformanceTrade {
  positionId: string;
  correlation: Phase7CPerformanceCorrelation;
  attribution: Phase7CPerformanceAttribution;
}

export interface Phase7CPerformanceRuleAggregate {
  rule: string;
  strategy: Strategy;
  sampleSize: number;
  wins: number;
  losses: number;
  breakeven: number;
  netPnl: number;
  expectancy: number;
  profitFactor: number | null;
  correlationCoveragePercent: number;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function runtimeRoot(): string {
  const configured = process.env.PHASE7C_RUNTIME_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const demoDir = process.env.PHASE7B_DEMO_WORK_DIR?.trim();
  if (demoDir) return path.resolve(demoDir, "..");
  return path.resolve(process.cwd(), ".runtime");
}

function decisionAuditRoot(accountMode: "DEMO" | "LIVE"): string {
  const base = path.resolve(runtimeRoot(), "phase7c-executors", "decision-observability");
  const accountRoot = path.resolve(base, accountMode.toLowerCase());
  if (accountMode === "LIVE") return accountRoot;
  return existsSync(accountRoot) ? accountRoot : base;
}

function normalizeScalar(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return null;
}

function eventNameOf(raw: RawEvent): string {
  for (const key of ["event", "eventName", "type", "phase", "status"]) {
    const value = normalizeScalar(raw[key]);
    if (value) return value.toUpperCase();
  }
  return "UNKNOWN";
}

function visitObject(
  value: unknown,
  visitor: (key: string, nested: unknown) => void,
  depth = 0,
): void {
  if (depth > 4 || value === null || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    visitor(key, nested);
    visitObject(nested, visitor, depth + 1);
  }
}

function makeIdentifier(kind: IdentifierKind, field: string, value: string): AuditIdentifier {
  return { kind, field, value, token: `${kind}:${value}` };
}

function identifiersOf(raw: RawEvent, eventName: string): AuditIdentifier[] {
  const values = new Map<string, AuditIdentifier>();
  const ticketAllowed = ENTRY_TICKET_EVENTS.has(eventName);
  visitObject(raw, (key, nested) => {
    const normalizedKey = key.toLowerCase();
    const scalar = normalizeScalar(nested);
    if (!scalar || scalar === "0") return;

    let kind: IdentifierKind | null = null;
    if (POSITION_KEYS.has(normalizedKey)) kind = "POSITION";
    else if (ticketAllowed && normalizedKey === "ticket") kind = "POSITION";
    else if (ORDER_KEYS.has(normalizedKey)) kind = "ORDER";
    else if (SIGNAL_KEYS.has(normalizedKey)) kind = "SIGNAL";
    if (!kind) return;

    const identifier = makeIdentifier(kind, key, scalar);
    values.set(identifier.token, identifier);
  });
  return [...values.values()];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeScalar(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => item.trim())
    .filter(Boolean);
}

function addCanonicalEntryConditions(
  value: unknown,
  passed: Set<string>,
  blocked: Set<string>,
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;

  for (const item of stringList(record.failedConditions ?? record.failed_conditions)) {
    blocked.add(item);
  }

  const conditions = Array.isArray(record.conditions) ? record.conditions : [];
  for (const condition of conditions) {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) continue;
    const row = condition as Record<string, unknown>;
    const id = normalizeScalar(row.id);
    const status = normalizeScalar(row.status)?.toUpperCase() ?? null;
    if (!id) continue;
    if (status === "PASS") passed.add(id);
    if (status === "FAIL") blocked.add(id);
  }
}

function ruleEvidence(raw: RawEvent): { passed: string[]; blocked: string[] } {
  const passed = new Set<string>();
  const blocked = new Set<string>();

  visitObject(raw, (key, nested) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "entryconditions" || normalizedKey === "entry_conditions") {
      addCanonicalEntryConditions(nested, passed, blocked);
      return;
    }
    if (PASS_KEYS.has(normalizedKey)) {
      for (const item of stringList(nested)) passed.add(item);
      return;
    }
    if (BLOCK_KEYS.has(normalizedKey)) {
      for (const item of stringList(nested)) blocked.add(item);
      return;
    }
    if (
      CHECK_CONTAINER_KEYS.has(normalizedKey) &&
      nested &&
      typeof nested === "object" &&
      !Array.isArray(nested)
    ) {
      for (const [check, result] of Object.entries(nested as Record<string, unknown>)) {
        if (result === true) passed.add(check);
        if (result === false) blocked.add(check);
      }
    }
  });

  return {
    passed: [...passed].sort(),
    blocked: [...blocked].sort(),
  };
}

function firstStringField(raw: RawEvent, keys: readonly string[]): string | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  let found: string | null = null;
  visitObject(raw, (key, nested) => {
    if (found || !wanted.has(key.toLowerCase())) return;
    found = normalizeScalar(nested);
  });
  return found;
}

function entryTypeOf(raw: RawEvent, eventName: string, strategy: Strategy): EntryType {
  const dailyMode = firstStringField(raw, ["dailyMode", "daily_mode"]);
  if ((dailyMode ?? "").toUpperCase() === "RECOVERY_TP") return "RECOVERY";

  const explicit = firstStringField(raw, [
    "entryType",
    "entry_type",
    "entryMode",
    "entry_mode",
    "entryPath",
    "entry_path",
    "entryState",
    "entry_state",
  ]);
  const haystack = `${eventName} ${explicit ?? ""}`.toUpperCase();
  if (haystack.includes("PULLBACK_ENTRY") || haystack.includes("PULLBACK")) return "PULLBACK";
  if (haystack.includes("ENTRY_IMMEDIATE") || haystack.includes("IMMEDIATE")) return "IMMEDIATE";
  if (strategy === "SIDEWAY" && (eventName === "ENTRY_SUBMIT" || eventName === "ENTRY_FILLED")) {
    return "IMMEDIATE";
  }
  return "UNKNOWN";
}

function regimeOf(raw: RawEvent): string | null {
  return firstStringField(raw, ["regime", "marketRegime", "market_regime"]);
}

function eventIdOf(raw: RawEvent, strategy: Strategy, index: number, eventName: string): string {
  const explicit = firstStringField(raw, ["eventId", "event_id"]);
  if (explicit) return explicit;
  const timestamp = firstStringField(raw, ["timestamp", "createdAt", "created_at", "at", "time"]);
  return `${strategy}:${timestamp ?? "NA"}:${eventName}:${index}`;
}

function relativeRuntimePath(absolutePath: string): string {
  return path.relative(runtimeRoot(), absolutePath).split(path.sep).join("/");
}

function parseAuditSource(strategy: Strategy, root: string, fileName: string): ParsedAuditSource {
  const absolutePath = path.resolve(root, fileName);
  const relativePath = relativeRuntimePath(absolutePath);
  if (!existsSync(absolutePath)) {
    return { strategy, relativePath, available: false, parsedRows: 0, malformedRows: 0, events: [] };
  }

  const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  const events: ParsedAuditEvent[] = [];
  let malformedRows = 0;

  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        malformedRows += 1;
        return;
      }
      const raw = parsed as RawEvent;
      const eventName = eventNameOf(raw);
      const rules = ruleEvidence(raw);
      events.push({
        raw,
        index,
        eventId: eventIdOf(raw, strategy, index, eventName),
        eventName,
        identifiers: identifiersOf(raw, eventName),
        passedRules: rules.passed,
        blockedRules: rules.blocked,
        entryType: entryTypeOf(raw, eventName, strategy),
        regime: regimeOf(raw),
      });
    } catch {
      malformedRows += 1;
    }
  });

  return {
    strategy,
    relativePath,
    available: true,
    parsedRows: events.length,
    malformedRows,
    events,
  };
}

class IdentifierUnion {
  private readonly parent = new Map<string, string>();

  add(token: string): void {
    if (!this.parent.has(token)) this.parent.set(token, token);
  }

  has(token: string): boolean {
    return this.parent.has(token);
  }

  find(token: string): string {
    const parent = this.parent.get(token);
    if (!parent) {
      this.parent.set(token, token);
      return token;
    }
    if (parent === token) return token;
    const root = this.find(parent);
    this.parent.set(token, root);
    return root;
  }

  union(left: string, right: string): void {
    this.add(left);
    this.add(right);
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }
}

interface CorrelationComponent {
  positionIds: Set<string>;
  events: ParsedAuditEvent[];
}

function buildCorrelationComponents(
  source: ParsedAuditSource,
  positionIds: readonly string[],
): Map<string, CorrelationComponent> {
  const union = new IdentifierUnion();

  for (const event of source.events) {
    const tokens = event.identifiers.map((identifier) => identifier.token);
    if (tokens.length === 0) continue;
    union.add(tokens[0]!);
    for (let index = 1; index < tokens.length; index += 1) {
      union.union(tokens[0]!, tokens[index]!);
    }
  }

  const eventsByRoot = new Map<string, ParsedAuditEvent[]>();
  for (const event of source.events) {
    const first = event.identifiers[0];
    if (!first || !union.has(first.token)) continue;
    const root = union.find(first.token);
    const rows = eventsByRoot.get(root) ?? [];
    rows.push(event);
    eventsByRoot.set(root, rows);
  }

  const components = new Map<string, CorrelationComponent>();
  for (const positionId of positionIds) {
    const token = `POSITION:${positionId}`;
    if (!union.has(token)) continue;
    const root = union.find(token);
    const component = components.get(root) ?? {
      positionIds: new Set<string>(),
      events: eventsByRoot.get(root) ?? [],
    };
    component.positionIds.add(positionId);
    components.set(root, component);
  }
  return components;
}

function positionIdOf(trade: Mt5PerformanceTrade): string {
  const match = /^mt5-(.+?)(?:-r\d+)?$/.exec(trade.id);
  return match?.[1] ?? trade.id;
}

function chooseEntryType(events: ParsedAuditEvent[]): EntryType {
  const types = new Set(events.map((event) => event.entryType).filter((value) => value !== "UNKNOWN"));
  if (types.has("RECOVERY")) return "RECOVERY";
  if (types.has("PULLBACK")) return "PULLBACK";
  if (types.has("IMMEDIATE")) return "IMMEDIATE";
  return "UNKNOWN";
}

function chooseRegime(events: ParsedAuditEvent[]): string | null {
  const values = new Set(events.map((event) => event.regime).filter((value): value is string => Boolean(value)));
  if (values.size !== 1) return null;
  return [...values][0] ?? null;
}

function aggregateRules(
  trades: readonly Phase7CPerformanceIntelligenceTrade[],
  exactCoveragePercent: number,
): Phase7CPerformanceRuleAggregate[] {
  const groups = new Map<string, Phase7CPerformanceIntelligenceTrade[]>();
  for (const trade of trades) {
    if (
      trade.correlation.verdict !== "EXACT" ||
      (trade.strategy !== "TREND" && trade.strategy !== "SIDEWAY")
    ) {
      continue;
    }
    for (const rule of trade.attribution.passedRules) {
      const key = `${trade.strategy}\u0000${rule}`;
      const rows = groups.get(key) ?? [];
      rows.push(trade);
      groups.set(key, rows);
    }
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const [strategy, rule] = key.split("\u0000") as [Strategy, string];
      const wins = rows.filter((row) => row.netPnl > 0);
      const losses = rows.filter((row) => row.netPnl < 0);
      const grossProfit = wins.reduce((sum, row) => sum + row.netPnl, 0);
      const grossLoss = Math.abs(losses.reduce((sum, row) => sum + row.netPnl, 0));
      const netPnl = rows.reduce((sum, row) => sum + row.netPnl, 0);
      return {
        rule,
        strategy,
        sampleSize: rows.length,
        wins: wins.length,
        losses: losses.length,
        breakeven: rows.length - wins.length - losses.length,
        netPnl: round(netPnl),
        expectancy: rows.length ? round(netPnl / rows.length) : 0,
        profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 3) : grossProfit > 0 ? null : 0,
        correlationCoveragePercent: exactCoveragePercent,
      };
    })
    .sort((a, b) => b.sampleSize - a.sampleSize || a.rule.localeCompare(b.rule));
}

function aggregateEntryTypes(trades: readonly Phase7CPerformanceIntelligenceTrade[]) {
  const keys: EntryType[] = ["IMMEDIATE", "PULLBACK", "RECOVERY", "UNKNOWN"];
  return keys.map((entryType) => {
    const rows = trades.filter(
      (trade) => trade.correlation.verdict === "EXACT" && trade.attribution.entryType === entryType,
    );
    const wins = rows.filter((row) => row.netPnl > 0);
    const losses = rows.filter((row) => row.netPnl < 0);
    const grossProfit = wins.reduce((sum, row) => sum + row.netPnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, row) => sum + row.netPnl, 0));
    const netPnl = rows.reduce((sum, row) => sum + row.netPnl, 0);
    return {
      entryType,
      sampleSize: rows.length,
      netPnl: round(netPnl),
      expectancy: rows.length ? round(netPnl / rows.length) : 0,
      winRatePercent: rows.length ? round((wins.length / rows.length) * 100) : 0,
      profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 3) : grossProfit > 0 ? null : 0,
    };
  });
}

export async function getPhase7CPerformanceIntelligence(days = 90, symbol = "XAUUSD") {
  const performance = await getMt5PerformanceSnapshot(days, symbol);
  const auditRoot = decisionAuditRoot(performance.account.accountMode);
  const auditSources = AUDIT_SOURCES.map((source) =>
    parseAuditSource(source.strategy, auditRoot, source.fileName),
  );
  const systemTrades = performance.trades.filter(
    (trade) => trade.ownership === "SYSTEM" && (trade.strategy === "TREND" || trade.strategy === "SIDEWAY"),
  );

  const componentsByStrategy = new Map<Strategy, Map<string, CorrelationComponent>>();
  for (const source of auditSources) {
    const strategyPositionIds = systemTrades
      .filter((trade) => trade.strategy === source.strategy)
      .map(positionIdOf);
    componentsByStrategy.set(
      source.strategy,
      buildCorrelationComponents(source, strategyPositionIds),
    );
  }

  const trades: Phase7CPerformanceIntelligenceTrade[] = systemTrades.map((trade) => {
    const strategy = trade.strategy as Strategy;
    const positionId = positionIdOf(trade);
    const source = auditSources.find((item) => item.strategy === strategy);
    const components = componentsByStrategy.get(strategy);
    const positionToken = `POSITION:${positionId}`;

    let component: CorrelationComponent | null = null;
    if (source && components) {
      for (const candidate of components.values()) {
        if (candidate.positionIds.has(positionId)) {
          component = candidate;
          break;
        }
      }
    }

    const verdict: CorrelationVerdict =
      !component
        ? "UNMATCHED"
        : component.positionIds.size === 1
          ? "EXACT"
          : "AMBIGUOUS";
    const attributedEvents = verdict === "EXACT" && component ? component.events : [];
    const evidence = attributedEvents.flatMap((event) =>
      event.identifiers
        .filter((identifier) => identifier.token === positionToken || identifier.kind !== "POSITION")
        .map(
          (identifier) =>
            `${event.eventId}:${identifier.kind}:${identifier.field}=${identifier.value}`,
        ),
    );

    return {
      ...trade,
      positionId,
      correlation: {
        verdict,
        method: verdict === "EXACT" ? "EXPLICIT_IDENTITY_GRAPH" : "NONE",
        evidence: [...new Set(evidence)].slice(0, 30),
      },
      attribution: {
        entryType: chooseEntryType(attributedEvents),
        regime: chooseRegime(attributedEvents),
        passedRules: [...new Set(attributedEvents.flatMap((event) => event.passedRules))].sort(),
        blockedRules: [...new Set(attributedEvents.flatMap((event) => event.blockedRules))].sort(),
        decisionEventIds: attributedEvents.map((event) => event.eventId).slice(0, 100),
      },
    };
  });

  const exactTrades = trades.filter((trade) => trade.correlation.verdict === "EXACT");
  const ambiguousTrades = trades.filter((trade) => trade.correlation.verdict === "AMBIGUOUS");
  const unmatchedTrades = trades.filter((trade) => trade.correlation.verdict === "UNMATCHED");
  const correlationCoveragePercent = trades.length
    ? round((exactTrades.length / trades.length) * 100, 1)
    : 0;
  const ruleEvidenceTrades = exactTrades.filter((trade) => trade.attribution.passedRules.length > 0);
  const regimeEvidenceTrades = exactTrades.filter((trade) => trade.attribution.regime !== null);

  const blockCounts = new Map<string, number>();
  for (const source of auditSources) {
    for (const event of source.events) {
      for (const rule of event.blockedRules) {
        const key = `${source.strategy}\u0000${rule}`;
        blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return {
    version: 1,
    source: "PHASE7C_PERFORMANCE_INTELLIGENCE" as const,
    generatedAt: performance.generatedAt,
    symbol: performance.symbol,
    days: performance.days,
    account: performance.account,
    accountingSource: performance.source,
    safety: {
      readOnly: true as const,
      strategyMutation: false as const,
      riskMutation: false as const,
      orderMutation: false as const,
      positionMutation: false as const,
      modeMutation: false as const,
      armMutation: false as const,
      autoRetune: false as const,
    },
    coverage: {
      totalSystemTrades: trades.length,
      exactTrades: exactTrades.length,
      ambiguousTrades: ambiguousTrades.length,
      unmatchedTrades: unmatchedTrades.length,
      correlationCoveragePercent,
      ruleEvidenceTrades: ruleEvidenceTrades.length,
      regimeEvidenceTrades: regimeEvidenceTrades.length,
    },
    auditSources: auditSources.map(
      ({ strategy, relativePath, available, parsedRows, malformedRows }) => ({
        strategy,
        relativePath,
        available,
        parsedRows,
        malformedRows,
      }),
    ),
    trades,
    rules: aggregateRules(trades, correlationCoveragePercent),
    entryTypes: aggregateEntryTypes(trades),
    decisionBlocks: [...blockCounts.entries()]
      .map(([key, count]) => {
        const [strategy, rule] = key.split("\u0000") as [Strategy, string];
        return { strategy, rule, count };
      })
      .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule)),
    unsupported: {
      mfeMae: "UNSUPPORTED_NOT_PERSISTED_IN_CURRENT_ACCOUNTING_SNAPSHOT",
      blockedRuleCounterfactualPnl: "UNSUPPORTED_NO_CAUSAL_COUNTERFACTUAL",
      missedOpportunityPnl: "UNSUPPORTED_NO_CANONICAL_COUNTERFACTUAL_TRADE",
    },
    notes: [
      "Realized PnL/accounting is reused from MT5_ACCOUNT_READ_ONLY; P2 does not reconstruct broker PnL independently.",
      "Decision audits use the same account-aware phase7c-executors/decision-observability directory contract as the canonical decision monitor.",
      "Trade attribution is fail-closed and follows explicit POSITION/ORDER/SIGNAL identifiers only; no timestamp or price proximity matching is used.",
      "AMBIGUOUS and UNMATCHED trades are excluded from rule and entry-type profitability aggregates.",
      "Historical trades without persisted rule/regime identity links remain unattributed; P2 does not backfill by inference.",
      "Decision-block counts are descriptive only; blocked rules are not assigned hypothetical PnL.",
      "MFE/MAE is not reported until a canonical persisted price-path source is available.",
    ],
  };
}

export const __test = {
  addCanonicalEntryConditions,
  entryTypeOf,
  identifiersOf,
  ruleEvidence,
};
