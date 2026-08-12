import { describe, expect, it } from "vitest";
import { Phase4WalkForwardService, phase4eConfigs } from "../src";
import type { Phase4ShadowTradeCase } from "../src";

const bar = (openTime: number, high: number, low: number, close: number) => ({
  openTime,
  closeTime: openTime + 300_000,
  open: close,
  high,
  low,
  close,
  volume: 100,
});

function makeCase(index: number): Phase4ShadowTradeCase {
  const signalTimestamp = 1_000 + index * 1_000_000;
  const entry = 3400;
  return {
    id: `case-${index}`,
    side: "BUY",
    signalTimestamp,
    entryExpiresAt: signalTimestamp + 300_000,
    entry,
    stopLoss: 3395,
    takeProfit: 3425,
    volume: 0.01,
    tickSize: 0.01,
    tickValuePerLot: 1,
    m5Bars: [
      bar(signalTimestamp, 3407, 3399, 3406),
      bar(signalTimestamp + 300_000, 3411, 3405, 3410),
      bar(signalTimestamp + 600_000, 3413, 3406, 3409),
    ],
  };
}

describe("Phase4WalkForwardService", () => {
  it("runs chronological folds and reports an OOS result", () => {
    const service = new Phase4WalkForwardService();
    const result = service.run(
      Array.from({ length: 12 }, (_, index) => makeCase(index)),
      phase4eConfigs().slice(0, 3),
      4,
    );

    expect(result.folds).toBe(4);
    expect(result.walkForward).toHaveLength(3);
    expect(result.configs).toBe(3);
    expect(result.robustBest).not.toBeNull();
    expect(service.format(result)).toContain("PHASE4E_RESEARCH_ONLY=PASS");
  });
});
