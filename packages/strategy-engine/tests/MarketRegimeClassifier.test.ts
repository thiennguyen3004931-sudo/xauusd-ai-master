import { describe, expect, it } from "vitest";
import { MarketRegimeClassifier, defaultStrategyEngineConfig } from "../src";
import { createContext } from "./fixtures";

describe("MarketRegimeClassifier", () => {
  it("classifies a strong BOS and ADX as breakout", () => {
    const result = new MarketRegimeClassifier().classify(createContext(), defaultStrategyEngineConfig);
    expect(result.regime).toBe("BREAKOUT");
    expect(result.confidence).toBeGreaterThanOrEqual(65);
  });
});
