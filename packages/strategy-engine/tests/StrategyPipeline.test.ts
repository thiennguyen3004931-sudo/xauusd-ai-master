import { describe, expect, it } from "vitest";
import {
  BreakoutRetestStrategy,
StrategyPipeline
} from "../src";
import { acceptsCommonResult, createContext } from "./fixtures";

describe("StrategyPipeline", () => {
  it("creates an executable breakout plan", () => {
    const result = new StrategyPipeline(
      { minimumCandidateEdge: 0 },
      [new BreakoutRetestStrategy()],
    ).evaluate(createContext());
    expect(result.action).toBe("EXECUTE");
    expect(result.plan?.selectedStrategy.strategyId).toBe("BREAKOUT_RETEST");
    expect(result.plan?.order.volume).toBe(0.2);
    expect(result.plan?.management.partialTargets).toHaveLength(3);
    expect(acceptsCommonResult(result.commonResult).decision).toBe("BUY");
  });
});
/**
 * 3E.5Y default remains TrendContinuation-only.
 * Legacy breakout behavior is still available only by explicit module opt-in.
 */
describe("StrategyPipeline trend-only production default", () => {
  it("does not restore BREAKOUT_RETEST into the default module set", () => {
    const result = new StrategyPipeline({
      minimumCandidateEdge: 0,
    }).evaluate(createContext());

    expect(
      result.selection.selected?.strategyId ?? null,
    ).not.toBe("BREAKOUT_RETEST");
  });
});
