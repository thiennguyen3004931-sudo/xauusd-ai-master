import { describe, expect, it } from "vitest";
import {
  Phase7TrendRiderService,
  type Phase7Bar,
} from "../src";

const M15 = 15 * 60_000;
const M5 = 5 * 60_000;

function buyM15(options: { fvg?: boolean; wideStop?: boolean } = {}): Phase7Bar[] {
  const bars: Phase7Bar[] = [];
  for (let i = 0; i < 200; i += 1) {
    const open = 100 + i * 0.1;
    bars.push({
      openTime: i * M15,
      closeTime: (i + 1) * M15,
      open,
      high: open + 0.12,
      low: open - 0.08,
      close: open + 0.05,
      volume: 100 + i,
    });
  }
  const anchor = bars[198]!;
  bars[198] = options.fvg === false
    ? { ...anchor, open: 119.1, high: 119.4, low: 118.9, close: 119.2 }
    : { ...anchor, open: 118.8, high: 119.0, low: 118.6, close: 118.9 };
  bars.push({
    openTime: 200 * M15,
    closeTime: 201 * M15,
    open: 120,
    high: 120.2,
    low: 119.3,
    close: 119.5,
    volume: 250,
  });
  bars.push({
    openTime: 201 * M15,
    closeTime: 202 * M15,
    open: 119.4,
    high: 120.4,
    low: options.wideStop ? 108 : 119.2,
    close: 120.2,
    volume: 300,
  });
  return bars;
}

function sellM15(): Phase7Bar[] {
  const bars: Phase7Bar[] = [];
  for (let i = 0; i < 200; i += 1) {
    const open = 140 - i * 0.1;
    bars.push({
      openTime: i * M15,
      closeTime: (i + 1) * M15,
      open,
      high: open + 0.08,
      low: open - 0.12,
      close: open - 0.05,
      volume: 100 + i,
    });
  }
  const anchor = bars[198]!;
  bars[198] = { ...anchor, open: 121.1, high: 121.2, low: 120.9, close: 121.0 };
  bars.push({
    openTime: 200 * M15,
    closeTime: 201 * M15,
    open: 120,
    high: 120.6,
    low: 119.8,
    close: 120.5,
    volume: 250,
  });
  bars.push({
    openTime: 201 * M15,
    closeTime: 202 * M15,
    open: 120.6,
    high: 120.8,
    low: 119.7,
    close: 119.9,
    volume: 300,
  });
  return bars;
}

function buyM5(signalTimestamp: number): Phase7Bar[] {
  return [
    { openTime: signalTimestamp, closeTime: signalTimestamp + M5, open: 120.2, high: 126.5, low: 120.1, close: 126, volume: 100 },
    { openTime: signalTimestamp + M5, closeTime: signalTimestamp + 2 * M5, open: 126, high: 131, low: 125, close: 130, volume: 110 },
    { openTime: signalTimestamp + 2 * M5, closeTime: signalTimestamp + 3 * M5, open: 130, high: 130, low: 125.5, close: 126, volume: 120 },
  ];
}

function sellM5(signalTimestamp: number): Phase7Bar[] {
  return [
    { openTime: signalTimestamp, closeTime: signalTimestamp + M5, open: 119.9, high: 120, low: 113.5, close: 114, volume: 100 },
    { openTime: signalTimestamp + M5, closeTime: signalTimestamp + 2 * M5, open: 114, high: 115, low: 109, close: 110, volume: 110 },
    { openTime: signalTimestamp + 2 * M5, closeTime: signalTimestamp + 3 * M5, open: 110, high: 114.5, low: 110, close: 114, volume: 120 },
  ];
}

const baseRequest = {
  riskCapUsd: 10,
  tickSize: 0.01,
  tickValuePerLot: 1,
  minVolume: 0.01,
  volumeStep: 0.01,
};

describe("Phase7TrendRiderService", () => {
  it("accepts bullish engulfing only with bullish MA trend and same-direction FVG", () => {
    const m15 = buyM15();
    const service = new Phase7TrendRiderService({ fvgLookbackBars: 1 });
    const result = service.run({ ...baseRequest, m15Bars: m15, m5Bars: buyM5(m15.at(-1)!.closeTime) });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.side).toBe("BUY");
    expect(result.signals[0]!.fvg).toBe(true);
    expect(result.signals[0]!.stopDistance).toBe(6);
    expect(result.signals[0]!.initialRiskUsd).toBeLessThanOrEqual(10);
  });

  it("rejects the engulfing setup when the same-direction FVG is absent", () => {
    const m15 = buyM15({ fvg: false });
    const service = new Phase7TrendRiderService({ fvgLookbackBars: 1 });
    const result = service.run({ ...baseRequest, m15Bars: m15, m5Bars: buyM5(m15.at(-1)!.closeTime) });
    expect(result.signals).toHaveLength(0);
    expect(result.metrics.fvgConfirmed).toBe(0);
  });

  it("rejects a setup whose engulfing structural stop requires more than 10 price units", () => {
    const m15 = buyM15({ wideStop: true });
    const service = new Phase7TrendRiderService({ fvgLookbackBars: 1 });
    const result = service.run({ ...baseRequest, m15Bars: m15, m5Bars: buyM5(m15.at(-1)!.closeTime) });
    expect(result.signals).toHaveLength(0);
    expect(result.metrics.stopWidthBlocked).toBe(1);
  });

  it("keeps the full 0.01 lot when partial close is impossible but still protects and trails profit", () => {
    const m15 = buyM15();
    const service = new Phase7TrendRiderService({ fvgLookbackBars: 1 });
    const result = service.run({ ...baseRequest, m15Bars: m15, m5Bars: buyM5(m15.at(-1)!.closeTime) });
    const trade = result.trades[0]!;
    expect(trade.filled).toBe(true);
    expect(trade.volume).toBe(0.01);
    expect(trade.partial1Applied).toBe(false);
    expect(trade.partial2Applied).toBe(false);
    expect(trade.protectedStopApplied).toBe(true);
    expect(trade.trailingActivated).toBe(true);
    expect(trade.remainingVolumeAtExit).toBe(0.01);
    expect(trade.pnl).toBeGreaterThan(0);
  });

  it("supports real partial closes when broker volume step is small enough", () => {
    const m15 = buyM15();
    const service = new Phase7TrendRiderService({ fvgLookbackBars: 1 });
    const result = service.run({
      m15Bars: m15,
      m5Bars: buyM5(m15.at(-1)!.closeTime),
      riskCapUsd: 10,
      tickSize: 0.01,
      tickValuePerLot: 1,
      minVolume: 0.001,
      volumeStep: 0.001,
    });
    const trade = result.trades[0]!;
    expect(trade.volume).toBe(0.016);
    expect(trade.partial1Applied).toBe(true);
    expect(trade.partial2Applied).toBe(true);
    expect(trade.partial1Volume).toBe(0.004);
    expect(trade.partial2Volume).toBe(0.004);
    expect(trade.remainingVolumeAtExit).toBe(0.008);
  });

  it("applies the same mandatory engulfing, MA and FVG logic to SELL", () => {
    const m15 = sellM15();
    const service = new Phase7TrendRiderService({ fvgLookbackBars: 1 });
    const result = service.run({ ...baseRequest, m15Bars: m15, m5Bars: sellM5(m15.at(-1)!.closeTime) });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.side).toBe("SELL");
    expect(result.signals[0]!.fvg).toBe(true);
    expect(result.trades[0]!.protectedStopApplied).toBe(true);
    expect(result.trades[0]!.trailingActivated).toBe(true);
  });
});
