import type { StrategyContext } from "../types/strategy";

export function trendRule(ctx: StrategyContext): number {

  if (ctx.trend === "Bullish") return 30;

  if (ctx.trend === "Bearish") return -30;

  return 0;
}