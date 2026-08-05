import type { StrategyContext } from "../types/strategy";

export function momentumRule(ctx: StrategyContext): number {

  if (ctx.momentum >= 80) return 25;

  if (ctx.momentum >= 70) return 15;

  return 0;
}