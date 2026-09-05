import type {
  Phase7CPerformanceEffectivenessRow,
  Phase7CPerformanceManagementEvent,
} from "../contracts/phase7c-performance-effectiveness.schema";
import {
  PHASE7C_COUNTERFACTUAL_INTELLIGENCE_SCHEMA_VERSION,
  type Phase7CCounterfactualFamily,
  type Phase7CCounterfactualFamilyAggregate,
  type Phase7CCounterfactualOutcome,
  type Phase7CCounterfactualScenario,
  type Phase7CCounterfactualSnapshot,
} from "../contracts/phase7c-counterfactual-intelligence.schema";
import { getPhase7CPerformanceEffectivenessSnapshot } from "./phase7c-performance-effectiveness.service";
import {
  evaluateFastMoveCounterfactual,
  phase7CCounterfactualSafety,
} from "./phase7c-counterfactual-evaluator.service";

const FAST_MOVE_SHADOW_GIVEBACK_GRID = [4, 6, 8, 12] as const;

export interface Phase7CCounterfactualRowsInput {
  rows: readonly Phase7CPerformanceEffectivenessRow[];
  generatedAt?: number;
}

export interface Phase7CCounterfactualQuery {
  days?: number;
  symbol?: string;
  limit?: number;
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function emptyOutcome(): Phase7CCounterfactualOutcome {
  return {
    exitPrice: null,
    netPnl: null,
    realizedR: null,
    lockedProfitPrice: null,
  };
}

function actualOutcome(row: Phase7CPerformanceEffectivenessRow): Phase7CCounterfactualOutcome {
  return {
    exitPrice: Number.isFinite(row.exit) ? row.exit : null,
    netPnl: Number.isFinite(row.netPnl) ? row.netPnl : null,
    realizedR: typeof row.excursion.realizedR === "number" && Number.isFinite(row.excursion.realizedR)
      ? row.excursion.realizedR
      : null,
    lockedProfitPrice: null,
  };
}

function exactCorrelation(row: Phase7CPerformanceEffectivenessRow): boolean {
  return row.correlation.verdict === "EXACT" && row.quality.exactCorrelation === true;
}

function exactManagement(row: Phase7CPerformanceEffectivenessRow): boolean {
  return row.management.evidence === "EXACT" && row.quality.exactManagementEvidence === true;
}

function ruleScenario(
  row: Phase7CPerformanceEffectivenessRow,
  ruleId: string,
  observedState: "PASSED" | "BLOCKED",
): Phase7CCounterfactualScenario {
  const evidenceExact = exactCorrelation(row);
  return {
    schemaVersion: PHASE7C_COUNTERFACTUAL_INTELLIGENCE_SCHEMA_VERSION,
    scenarioId: `${row.tradeKey}:RULE_OBSERVATION:${observedState}:${ruleId}`,
    tradeKey: row.tradeKey,
    positionId: row.positionId,
    strategy: row.strategy,
    side: row.side,
    entryType: row.entryType,
    regime: row.regime,
    family: "RULE_OBSERVATION",
    mode: "SHADOW_ONLY",
    baseline: {
      description: "OBSERVED_RULE_STATE",
      activationPrice: null,
      givebackPrice: null,
      ruleId,
      ruleState: observedState,
      managementFamily: null,
    },
    alternative: {
      description: "ALTERNATIVE_RULE_STATE",
      activationPrice: null,
      givebackPrice: null,
      ruleId,
      ruleState: "ALTERNATIVE",
      managementFamily: null,
    },
    evidence: {
      verdict: evidenceExact ? "BOUNDED" : "UNAVAILABLE",
      sources: evidenceExact ? [...row.correlation.evidence] : [],
    },
    actualOutcome: actualOutcome(row),
    shadowOutcome: emptyOutcome(),
    delta: { exitPrice: null, netPnl: null, realizedR: null, lockedProfitPrice: null },
    quality: {
      warnings: evidenceExact
        ? ["COUNTERFACTUAL_RULE_OUTCOME_NOT_PROVABLE", "COUNTERFACTUAL_PNL_NOT_PROVABLE"]
        : ["CORRELATION_NOT_EXACT"],
    },
    safety: phase7CCounterfactualSafety(),
  };
}

function managementSources(events: readonly Phase7CPerformanceManagementEvent[]): string[] {
  return [...new Set(events.map((event) => event.source).filter(Boolean))];
}

function managementScenario(
  row: Phase7CPerformanceEffectivenessRow,
  family: string,
  events: readonly Phase7CPerformanceManagementEvent[],
): Phase7CCounterfactualScenario {
  const evidenceExact = exactCorrelation(row) && exactManagement(row);
  return {
    schemaVersion: PHASE7C_COUNTERFACTUAL_INTELLIGENCE_SCHEMA_VERSION,
    scenarioId: `${row.tradeKey}:MANAGEMENT_EXIT_POLICY:${family}`,
    tradeKey: row.tradeKey,
    positionId: row.positionId,
    strategy: row.strategy,
    side: row.side,
    entryType: row.entryType,
    regime: row.regime,
    family: "MANAGEMENT_EXIT_POLICY",
    mode: "SHADOW_ONLY",
    baseline: {
      description: "OBSERVED_MANAGEMENT_FAMILY",
      activationPrice: null,
      givebackPrice: null,
      ruleId: null,
      ruleState: null,
      managementFamily: family,
    },
    alternative: {
      description: "ALTERNATIVE_MANAGEMENT_EXIT_POLICY",
      activationPrice: null,
      givebackPrice: null,
      ruleId: null,
      ruleState: "ALTERNATIVE",
      managementFamily: family,
    },
    evidence: {
      verdict: evidenceExact ? "BOUNDED" : "UNAVAILABLE",
      sources: evidenceExact ? managementSources(events) : [],
    },
    actualOutcome: actualOutcome(row),
    shadowOutcome: emptyOutcome(),
    delta: { exitPrice: null, netPnl: null, realizedR: null, lockedProfitPrice: null },
    quality: {
      warnings: evidenceExact
        ? ["COUNTERFACTUAL_MANAGEMENT_EXIT_NOT_PROVABLE", "COUNTERFACTUAL_PNL_NOT_PROVABLE"]
        : [exactCorrelation(row) ? "MANAGEMENT_EVIDENCE_NOT_EXACT" : "CORRELATION_NOT_EXACT"],
    },
    safety: phase7CCounterfactualSafety(),
  };
}

function scenariosForRow(row: Phase7CPerformanceEffectivenessRow): Phase7CCounterfactualScenario[] {
  const scenarios: Phase7CCounterfactualScenario[] = [];
  for (const givebackPrice of FAST_MOVE_SHADOW_GIVEBACK_GRID) {
    scenarios.push(
      evaluateFastMoveCounterfactual({
        tradeKey: row.tradeKey,
        positionId: row.positionId,
        strategy: row.strategy,
        side: row.side,
        entryType: row.entryType,
        regime: row.regime,
        entry: row.entry,
        actualExit: row.exit,
        actualNetPnl: row.netPnl,
        actualRealizedR: row.excursion.realizedR,
        exactCorrelation: exactCorrelation(row),
        exactManagementEvidence: exactManagement(row),
        managementEvents: row.management.events,
        orderedExitSidePrices: [],
        alternativeGivebackPrice: givebackPrice,
      }),
    );
  }

  for (const ruleId of [...new Set(row.rules.passed.map((value) => value.trim()).filter(Boolean))]) {
    scenarios.push(ruleScenario(row, ruleId, "PASSED"));
  }
  for (const ruleId of [...new Set(row.rules.blocked.map((value) => value.trim()).filter(Boolean))]) {
    scenarios.push(ruleScenario(row, ruleId, "BLOCKED"));
  }

  const eventsByFamily = new Map<string, Phase7CPerformanceManagementEvent[]>();
  for (const event of row.management.events) {
    const family = event.family.trim();
    if (!family) continue;
    const events = eventsByFamily.get(family) ?? [];
    events.push(event);
    eventsByFamily.set(family, events);
  }
  for (const [family, events] of eventsByFamily) {
    scenarios.push(managementScenario(row, family, events));
  }
  return scenarios;
}

function average(values: readonly (number | null)[]): number | null {
  const finite = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (finite.length === 0) return null;
  return round(finite.reduce((sum, value) => sum + value, 0) / finite.length);
}

function familyAggregate(
  family: Phase7CCounterfactualFamily,
  scenarios: readonly Phase7CCounterfactualScenario[],
): Phase7CCounterfactualFamilyAggregate {
  const selected = scenarios.filter((scenario) => scenario.family === family);
  const comparable = selected
    .map((scenario) => scenario.delta.lockedProfitPrice ?? scenario.delta.exitPrice)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    family,
    scenarioCount: selected.length,
    exactCount: selected.filter((scenario) => scenario.evidence.verdict === "EXACT").length,
    boundedCount: selected.filter((scenario) => scenario.evidence.verdict === "BOUNDED").length,
    unavailableCount: selected.filter((scenario) => scenario.evidence.verdict === "UNAVAILABLE").length,
    averageDeltaExitPrice: average(selected.map((scenario) => scenario.delta.exitPrice)),
    averageDeltaLockedProfitPrice: average(selected.map((scenario) => scenario.delta.lockedProfitPrice)),
    improvementCount: comparable.filter((value) => value > 0).length,
    deteriorationCount: comparable.filter((value) => value < 0).length,
  };
}

export function buildPhase7CCounterfactualSnapshotFromRows(
  input: Phase7CCounterfactualRowsInput,
): Phase7CCounterfactualSnapshot {
  const rows = [...input.rows];
  const scenarios = rows.flatMap(scenariosForRow);
  const exactCount = scenarios.filter((scenario) => scenario.evidence.verdict === "EXACT").length;
  const boundedCount = scenarios.filter((scenario) => scenario.evidence.verdict === "BOUNDED").length;
  const unavailableCount = scenarios.filter((scenario) => scenario.evidence.verdict === "UNAVAILABLE").length;
  const evidenceQualifiedCount = exactCount + boundedCount;
  const families: Phase7CCounterfactualFamily[] = [
    "FAST_MOVE_GIVEBACK",
    "RULE_OBSERVATION",
    "MANAGEMENT_EXIT_POLICY",
  ];

  return {
    schemaVersion: PHASE7C_COUNTERFACTUAL_INTELLIGENCE_SCHEMA_VERSION,
    generatedAt: Number.isFinite(Number(input.generatedAt)) ? Number(input.generatedAt) : Date.now(),
    source: "PHASE7C_COUNTERFACTUAL_INTELLIGENCE",
    readOnly: true,
    shadowOnly: true,
    safety: phase7CCounterfactualSafety(),
    summary: {
      tradeCount: rows.length,
      scenarioCount: scenarios.length,
      exactCount,
      boundedCount,
      unavailableCount,
      evidenceQualifiedCount,
      evidenceCoveragePercent: scenarios.length > 0
        ? round((evidenceQualifiedCount / scenarios.length) * 100, 1)
        : 0,
    },
    aggregates: {
      family: families.map((family) => familyAggregate(family, scenarios)),
    },
    scenarios,
    notes: [
      "P4 is SHADOW_ONLY and read-only. It never applies parameters, changes strategy/risk, or mutates orders, positions, mode, or ARM state.",
      "M5 OHLC is not treated as ordered intrabar evidence; historical Fast-Move scenarios remain BOUNDED or UNAVAILABLE unless canonical ordered exit-side prices exist.",
      "BOUNDED scenarios may compare explicit locked-profit floors, but counterfactual exit, PnL, and realized-R remain null when they are not provable.",
      "RULE_OBSERVATION and MANAGEMENT_EXIT_POLICY describe evidence-bounded alternatives only; they do not manufacture missed-trade PnL or causal claims.",
      "P4 produces evidence and deltas, not a recommendation; P5 recommendation logic remains a separate future subsystem with AUTO_RETUNE disabled.",
    ],
  };
}

export async function getPhase7CCounterfactualIntelligence(
  query: Phase7CCounterfactualQuery = {},
): Promise<Phase7CCounterfactualSnapshot> {
  const effectiveness = await getPhase7CPerformanceEffectivenessSnapshot({
    days: query.days,
    symbol: query.symbol,
    limit: query.limit,
  });
  return buildPhase7CCounterfactualSnapshotFromRows({
    rows: effectiveness.rows,
    generatedAt: effectiveness.generatedAt,
  });
}
