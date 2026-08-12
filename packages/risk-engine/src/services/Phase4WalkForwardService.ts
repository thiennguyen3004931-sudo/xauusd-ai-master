import type {
  Phase4ShadowManagementConfig,
  Phase4ShadowReplayMetrics,
  Phase4ShadowTradeCase,
} from "../models";
import { Phase4ShadowReplayService } from "./Phase4ShadowReplayService";

export interface Phase4WalkForwardFoldResult {
  fold: number;
  trainCases: number;
  testCases: number;
  selectedConfig: Phase4ShadowManagementConfig;
  trainMetrics: Phase4ShadowReplayMetrics;
  testMetrics: Phase4ShadowReplayMetrics;
}

export interface Phase4WalkForwardConfigStability {
  id: string;
  management: Phase4ShadowManagementConfig;
  foldMetrics: Phase4ShadowReplayMetrics[];
  positiveExpectancyFolds: number;
  positiveProfitFactorFolds: number;
  averageExpectancy: number;
  minimumExpectancy: number;
  averageProfitFactor: number;
  totalNetPnl: number;
}

export interface Phase4WalkForwardResult {
  totalCases: number;
  folds: number;
  configs: number;
  walkForward: Phase4WalkForwardFoldResult[];
  stability: Phase4WalkForwardConfigStability[];
  robustBest: Phase4WalkForwardConfigStability | null;
  oosNetPnl: number;
  oosExpectancy: number;
  oosPositiveFolds: number;
}

export class Phase4WalkForwardService {
  run(
    cases: readonly Phase4ShadowTradeCase[],
    configs: readonly Phase4ShadowManagementConfig[] = phase4eConfigs(),
    foldCount = 4,
  ): Phase4WalkForwardResult {
    const ordered = [...cases].sort(
      (a, b) => a.signalTimestamp - b.signalTimestamp || a.id.localeCompare(b.id),
    );
    const folds = splitContiguous(ordered, Math.max(3, foldCount));

    const stability = configs.map((management, index) => {
      const foldMetrics = folds.map((fold) =>
        new Phase4ShadowReplayService(management).run(fold).metrics,
      );
      const finitePfs = foldMetrics
        .map((item) => item.profitFactor)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      return {
        id: `P4E-${String(index + 1).padStart(2, "0")}`,
        management,
        foldMetrics,
        positiveExpectancyFolds: foldMetrics.filter((item) => item.expectancy > 0).length,
        positiveProfitFactorFolds: foldMetrics.filter(
          (item) => item.profitFactor !== null && item.profitFactor > 1,
        ).length,
        averageExpectancy: round(avg(foldMetrics.map((item) => item.expectancy)), 4),
        minimumExpectancy: round(Math.min(...foldMetrics.map((item) => item.expectancy)), 4),
        averageProfitFactor: round(avg(finitePfs), 4),
        totalNetPnl: round(foldMetrics.reduce((sum, item) => sum + item.netPnl, 0)),
      };
    });

    const robustBest = [...stability].sort(compareStability)[0] ?? null;
    const walkForward: Phase4WalkForwardFoldResult[] = [];

    for (let testIndex = 1; testIndex < folds.length; testIndex += 1) {
      const train = folds.slice(0, testIndex).flat();
      const test = folds[testIndex]!;
      let selected: { config: Phase4ShadowManagementConfig; metrics: Phase4ShadowReplayMetrics } | null = null;

      for (const config of configs) {
        const metrics = new Phase4ShadowReplayService(config).run(train).metrics;
        if (
          selected === null ||
          metrics.expectancy > selected.metrics.expectancy ||
          (metrics.expectancy === selected.metrics.expectancy &&
            (metrics.profitFactor ?? 0) > (selected.metrics.profitFactor ?? 0))
        ) {
          selected = { config, metrics };
        }
      }

      if (!selected) continue;
      const testMetrics = new Phase4ShadowReplayService(selected.config).run(test).metrics;
      walkForward.push({
        fold: testIndex + 1,
        trainCases: train.length,
        testCases: test.length,
        selectedConfig: selected.config,
        trainMetrics: selected.metrics,
        testMetrics,
      });
    }

    const oosFilled = walkForward.reduce((sum, item) => sum + item.testMetrics.filledTrades, 0);
    const oosNetPnl = round(walkForward.reduce((sum, item) => sum + item.testMetrics.netPnl, 0));

    return {
      totalCases: ordered.length,
      folds: folds.length,
      configs: configs.length,
      walkForward,
      stability,
      robustBest,
      oosNetPnl,
      oosExpectancy: round(oosFilled > 0 ? oosNetPnl / oosFilled : 0, 4),
      oosPositiveFolds: walkForward.filter((item) => item.testMetrics.expectancy > 0).length,
    };
  }

  format(result: Phase4WalkForwardResult): string[] {
    const lines = [
      `PHASE4E_TOTAL_CASES=${result.totalCases}`,
      `PHASE4E_FOLDS=${result.folds}`,
      `PHASE4E_CONFIGS=${result.configs}`,
    ];

    for (const item of result.walkForward) {
      const c = item.selectedConfig;
      const m = item.testMetrics;
      lines.push(
        `PHASE4E_OOS_FOLD=${item.fold}|TRAIN=${item.trainCases}|TEST=${item.testCases}|BE_TRIGGER=${c.breakEvenTriggerPrice}|BE_OFFSET=${c.breakEvenOffsetPrice}|TRAIL_TRIGGER=${c.trailingTriggerPrice}|TRAIL_DISTANCE=${c.trailingDistancePrice}|NET_PNL=${m.netPnl}|PF=${m.profitFactor ?? "INF"}|EXPECTANCY=${m.expectancy}|AVG_R=${m.averageRMultiple}`,
      );
    }

    if (result.robustBest) {
      const b = result.robustBest;
      const c = b.management;
      lines.push(
        `PHASE4E_ROBUST_BEST=${b.id}|BE_TRIGGER=${c.breakEvenTriggerPrice}|BE_OFFSET=${c.breakEvenOffsetPrice}|TRAIL_TRIGGER=${c.trailingTriggerPrice}|TRAIL_DISTANCE=${c.trailingDistancePrice}|POS_EXP_FOLDS=${b.positiveExpectancyFolds}/${result.folds}|POS_PF_FOLDS=${b.positiveProfitFactorFolds}/${result.folds}|AVG_EXPECTANCY=${b.averageExpectancy}|MIN_EXPECTANCY=${b.minimumExpectancy}|AVG_PF=${b.averageProfitFactor}|TOTAL_NET_PNL=${b.totalNetPnl}`,
      );
    }

    lines.push(`PHASE4E_OOS_NET_PNL=${result.oosNetPnl}`);
    lines.push(`PHASE4E_OOS_EXPECTANCY=${result.oosExpectancy}`);
    lines.push(`PHASE4E_OOS_POSITIVE_FOLDS=${result.oosPositiveFolds}/${result.walkForward.length}`);
    lines.push("PHASE4E_RESEARCH_ONLY=PASS");
    return lines;
  }
}

export function phase4eConfigs(): Phase4ShadowManagementConfig[] {
  const configs: Phase4ShadowManagementConfig[] = [];
  for (const breakEvenOffsetPrice of [1, 2]) {
    for (const trailingTriggerPrice of [10, 12]) {
      for (const trailingDistancePrice of [5, 6, 7]) {
        configs.push({
          breakEvenTriggerPrice: 6,
          breakEvenOffsetPrice,
          trailingTriggerPrice,
          trailingDistancePrice,
        });
      }
    }
  }
  return configs;
}

function splitContiguous<T>(items: readonly T[], foldCount: number): T[][] {
  const count = Math.min(foldCount, Math.max(1, items.length));
  const result: T[][] = [];
  for (let fold = 0; fold < count; fold += 1) {
    const start = Math.floor((fold * items.length) / count);
    const end = Math.floor(((fold + 1) * items.length) / count);
    result.push(items.slice(start, end));
  }
  return result;
}

function compareStability(a: Phase4WalkForwardConfigStability, b: Phase4WalkForwardConfigStability): number {
  return (
    b.positiveExpectancyFolds - a.positiveExpectancyFolds ||
    b.positiveProfitFactorFolds - a.positiveProfitFactorFolds ||
    b.minimumExpectancy - a.minimumExpectancy ||
    b.averageExpectancy - a.averageExpectancy ||
    b.totalNetPnl - a.totalNetPnl
  );
}

function avg(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
