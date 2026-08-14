import { describe, expect, it } from "vitest";
import {
  Phase7BDualPatternTrendRiderService,
  type Phase7Bar,
} from "../src";

const M15 = 15 * 60_000;
const M5 = 5 * 60_000;

function bullishTwoCandleM15(): Phase7Bar[] {
  const bars: Phase7Bar[] = [];
  for (let i = 0; i < 199; i += 1) {
    const open = 100 + i * 0.1;
    bars.push({
      openTime: i * M15,
      closeTime: (i + 1) * M15,
      open,
      high: open + 0.15,
      low: open - 0.05,
      close: open + 0.08,
      volume: 100 + i,
    });
  }

  bars[198] = {
    ...bars[198]!,
    open: 118.7,
    high: 119.0,
    low: 118.6,
    close: 118.9,
  };

  // A bearish body = 1.0. B and C are bullish bodies = 0.7 + 0.7,
  // so B < A while B + C > A, which is the intended valid dominance fixture.
  bars.push({
    openTime: 199 * M15,
    closeTime: 200 * M15,
    open: 120.0,
    high: 120.2,
    low: 118.9,
    close: 119.0,
    volume: 250,
  });
  bars.push({
    openTime: 200 * M15,
    closeTime: 201 * M15,
    open: 119.6,
    high: 120.5,
    low: 119.3,
    close: 120.3,
    volume: 300,
  });
  bars.push({
    openTime: 201 * M15,
    closeTime: 202 * M15,
    open: 120.2,
    high: 121.1,
    low: 119.2,
    close: 120.9,
    volume: 320,
  });
  return bars;
}

function bullishTwoCandleM15TooWeak(): Phase7Bar[] {
  const bars = bullishTwoCandleM15();
  bars[199] = { ...bars[199]!, open: 120.0, close: 119.0, high: 120.2, low: 118.9 };
  bars[200] = { ...bars[200]!, open: 119.6, close: 119.9, high: 120.1, low: 119.3 };
  bars[201] = { ...bars[201]!, open: 119.9, close: 120.2, high: 120.4, low: 119.2 };
  return bars;
}

function m5TrendMove(signalTimestamp: number, entry: number): Phase7Bar[] {
  return [
    {
      openTime: signalTimestamp,
      closeTime: signalTimestamp + M5,
      open: entry,
      high: entry + 6.5,
      low: entry - 0.2,
      close: entry + 6.0,
      volume: 100,
    },
    {
      openTime: signalTimestamp + M5,
      closeTime: signalTimestamp + 2 * M5,
      open: entry + 6.0,
      high: entry + 10.5,
      low: entry + 5.5,
      close: entry + 10.0,
      volume: 110,
    },
    {
      openTime: signalTimestamp + 2 * M5,
      closeTime: signalTimestamp + 3 * M5,
      open: entry + 10.0,
      high: entry + 10.2,
      low: entry - 0.1,
      close: entry,
      volume: 120,
    },
  ];
}

const requestMeta = {
  fixedVolume: 0.03,
  tickSize: 0.01,
  tickValuePerLot: 1,
  minVolume: 0.01,
  volumeStep: 0.01,
};

describe("Phase7BDualPatternTrendRiderService", () => {
  it("accepts two consecutive bullish candles only when their combined bodies dominate the prior bearish body", () => {
    const m15 = bullishTwoCandleM15();
    const service = new Phase7BDualPatternTrendRiderService({ fvgLookbackBars: 2 });
    const signalTimestamp = m15.at(-1)!.closeTime;
    const result = service.run({
      ...requestMeta,
      m15Bars: m15,
      m5Bars: m5TrendMove(signalTimestamp, m15.at(-1)!.close),
    });

    const twoCandle = result.signals.find((signal) => signal.pattern === "TWO_CANDLE_BODY_DOMINANCE");
    expect(twoCandle).toBeDefined();
    expect(twoCandle!.side).toBe("BUY");
  });

  it("does not accept a weak two-candle sequence whose combined bodies do not dominate the prior opposite candle", () => {
    const m15 = bullishTwoCandleM15TooWeak();
    const service = new Phase7BDualPatternTrendRiderService({ fvgLookbackBars: 2 });
    const signalTimestamp = m15.at(-1)!.closeTime;
    const result = service.run({
      ...requestMeta,
      m15Bars: m15,
      m5Bars: m5TrendMove(signalTimestamp, m15.at(-1)!.close),
    });

    expect(result.signals.filter((signal) => signal.pattern === "TWO_CANDLE_BODY_DOMINANCE")).toHaveLength(0);
  });

  it("moves SL to entry at +6 and closes one third at +10 while keeping the remainder", () => {
    const m15 = bullishTwoCandleM15();
    const service = new Phase7BDualPatternTrendRiderService({ fvgLookbackBars: 2 });
    const signalTimestamp = m15.at(-1)!.closeTime;
    const entry = m15.at(-1)!.close;
    const result = service.run({
      ...requestMeta,
      m15Bars: m15,
      m5Bars: m5TrendMove(signalTimestamp, entry),
    });

    const trade = result.trades.find((item) => item.pattern === "TWO_CANDLE_BODY_DOMINANCE")!;
    expect(trade).toBeDefined();
    expect(trade.filled).toBe(true);
    expect(trade.breakEvenApplied).toBe(true);
    expect(trade.partialApplied).toBe(true);
    expect(trade.partialVolume).toBe(0.01);
    expect(trade.remainingVolumeAtExit).toBe(0.02);
    expect(trade.finalStopLoss).toBeGreaterThanOrEqual(trade.entry);
  });
});