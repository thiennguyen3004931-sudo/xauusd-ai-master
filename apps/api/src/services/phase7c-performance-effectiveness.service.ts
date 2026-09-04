import {
  PHASE7C_PERFORMANCE_EFFECTIVENESS_SCHEMA_VERSION,
  type Phase7CPerformanceEffectivenessMetricBucket,
  type Phase7CPerformanceEffectivenessRow,
  type Phase7CPerformanceEffectivenessSnapshot,
} from "../contracts/phase7c-performance-effectiveness.schema";

export interface Phase7CPerformanceEffectivenessRowsInput {
  rows: readonly Phase7CPerformanceEffectivenessRow[];
  generatedAt?: number;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function isExact(row: Phase7CPerformanceEffectivenessRow): boolean {
  return row.correlation.verdict === "EXACT" && row.quality.exactCorrelation === true;
}

function metricBucket(
  key: string,
  rows: readonly Phase7CPerformanceEffectivenessRow[],
): Phase7CPerformanceEffectivenessMetricBucket {
  const wins = rows.filter((row) => row.netPnl > 0).length;
  const losses = rows.filter((row) => row.netPnl < 0).length;
  const breakeven = rows.length - wins - losses;
  const netPnl = rows.reduce((total, row) => total + Number(row.netPnl || 0), 0);
  const grossProfit = rows.reduce(
    (total, row) => total + Math.max(0, Number(row.netPnl || 0)),
    0,
  );
  const grossLoss = rows.reduce(
    (total, row) => total + Math.abs(Math.min(0, Number(row.netPnl || 0))),
    0,
  );
  return {
    key,
    sampleSize: rows.length,
    wins,
    losses,
    breakeven,
    netPnl: round(netPnl),
    expectancy: rows.length > 0 ? round(netPnl / rows.length) : 0,
    winRatePercent: rows.length > 0 ? round((wins / rows.length) * 100, 1) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
  };
}

function groupedBuckets(
  rows: readonly Phase7CPerformanceEffectivenessRow[],
  keysOf: (row: Phase7CPerformanceEffectivenessRow) => readonly string[],
): Phase7CPerformanceEffectivenessMetricBucket[] {
  const groups = new Map<string, Phase7CPerformanceEffectivenessRow[]>();
  for (const row of rows) {
    for (const rawKey of new Set(keysOf(row).map((key) => key.trim()).filter(Boolean))) {
      const group = groups.get(rawKey) ?? [];
      group.push(row);
      groups.set(rawKey, group);
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => metricBucket(key, group))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function average(values: readonly (number | null)[]): number | null {
  const finite = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (finite.length === 0) return null;
  return round(finite.reduce((total, value) => total + value, 0) / finite.length, 4);
}

function lockedProfitPrice(row: Phase7CPerformanceEffectivenessRow): number | null {
  const candidates = row.management.events
    .filter((event) => event.family === "FAST_MOVE_TIGHTEN")
    .map((event) => event.stopLoss)
    .filter((stopLoss): stopLoss is number => typeof stopLoss === "number" && Number.isFinite(stopLoss))
    .map((stopLoss) => row.side === "BUY" ? stopLoss - row.entry : row.entry - stopLoss)
    .filter((distance) => distance > 0);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export function buildPhase7CPerformanceEffectivenessSnapshotFromRows(
  input: Phase7CPerformanceEffectivenessRowsInput,
): Phase7CPerformanceEffectivenessSnapshot {
  const rows = [...input.rows];
  const exactRows = rows.filter(isExact);
  const excursionRows = exactRows.filter(
    (row) =>
      row.quality.completeExcursionEvidence === true &&
      row.excursion.evidence === "COMPLETE_M5_WINDOW",
  );
  const managementRows = exactRows.filter(
    (row) => row.quality.exactManagementEvidence === true && row.management.evidence === "EXACT",
  );

  const managementFamilies = groupedBuckets(
    managementRows,
    (row) => [...new Set(row.management.events.map((event) => event.family))],
  );
  const lockedProfit = exactRows
    .map(lockedProfitPrice)
    .filter((value): value is number => value !== null);

  return {
    schemaVersion: PHASE7C_PERFORMANCE_EFFECTIVENESS_SCHEMA_VERSION,
    generatedAt: Number.isFinite(Number(input.generatedAt)) ? Number(input.generatedAt) : Date.now(),
    source: "PHASE7C_PERFORMANCE_EFFECTIVENESS",
    readOnly: true,
    safety: {
      readOnly: true,
      runtimeMutation: false,
      strategyMutation: false,
      riskMutation: false,
      orderMutation: false,
      positionMutation: false,
      modeMutation: false,
      armMutation: false,
      autoRetune: false,
      liveTestOrder: false,
    },
    summary: {
      totalRows: rows.length,
      exactRows: exactRows.length,
      excursionQualifiedRows: excursionRows.length,
      managementQualifiedRows: managementRows.length,
      evidenceCoveragePercent: rows.length > 0
        ? round((exactRows.length / rows.length) * 100, 1)
        : 0,
    },
    aggregates: {
      strategy: groupedBuckets(exactRows, (row) => [row.strategy]),
      entryType: groupedBuckets(exactRows, (row) => [row.entryType]),
      regime: groupedBuckets(exactRows, (row) => [row.regime ?? "UNKNOWN"]),
      rule: groupedBuckets(exactRows, (row) => row.rules.passed),
      management: managementFamilies,
      excursion: {
        sampleSize: excursionRows.length,
        averageMfePrice: average(excursionRows.map((row) => row.excursion.mfePrice)),
        averageMaePrice: average(excursionRows.map((row) => row.excursion.maePrice)),
        averageMfeR: average(excursionRows.map((row) => row.excursion.mfeR)),
        averageMaeR: average(excursionRows.map((row) => row.excursion.maeR)),
        averageRealizedR: average(excursionRows.map((row) => row.excursion.realizedR)),
        averagePeakToExitGivebackPrice: average(
          excursionRows.map((row) => row.excursion.peakToExitGivebackPrice),
        ),
      },
      fastMove: {
        exactSampleSize: exactRows.length,
        triggeredRows: exactRows.filter((row) => row.fastMove.triggered).length,
        handoffRows: exactRows.filter((row) => row.fastMove.handoffToM5).length,
        averageLockedProfitPrice: average(lockedProfit),
      },
    },
    rows,
    notes: [
      "Expectancy, rule, regime, strategy, and management aggregates include EXACT correlation rows only; AMBIGUOUS and UNMATCHED evidence remains fail-closed.",
      "Management buckets describe observed association with realized outcomes; they do not establish causal effectiveness by themselves.",
      "Excursion aggregates include only COMPLETE_M5_WINDOW evidence. R metrics remain null when initial structural risk is not proven.",
      "Fast-Move locked-profit distance is derived only from explicit FAST_MOVE_TIGHTEN stop evidence. Shadow replay remains separate and SHADOW_ONLY.",
      "This snapshot performs no runtime, strategy, risk, order, position, mode, ARM, AUTO, or LIVE-test-order mutation.",
    ],
  };
}
