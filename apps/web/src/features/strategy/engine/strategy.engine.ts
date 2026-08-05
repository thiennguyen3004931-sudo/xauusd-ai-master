import type {
  StrategyContext,
  StrategyResult,
} from "../types/strategy";

import { trendRule } from "../rules/trend.rule";
import { momentumRule } from "../rules/momentum.rule";
import { smcRule } from "../rules/smc.rule";
import { sessionRule } from "../rules/session.rule";

export function runStrategy(
  ctx: StrategyContext
): StrategyResult {

  const score =
    trendRule(ctx) +
    momentumRule(ctx) +
    smcRule(ctx) +
    sessionRule();

  let action: "BUY" | "SELL" | "WAIT" = "WAIT";

  if (score >= 70)
    action = "BUY";

  if (score <= -70)
    action = "SELL";

  return {
    action,
    score,
    reasons: [],
  };
}