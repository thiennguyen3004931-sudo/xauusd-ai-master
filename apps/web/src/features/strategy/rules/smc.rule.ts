import type { StrategyContext } from "../types/strategy";

export function smcRule(ctx: StrategyContext): number {

  let score = 0;

  if (ctx.bos)
    score += 15;

  if (ctx.choch)
    score += 10;

  if (ctx.liquidity)
    score += 10;

  if (ctx.bullishOB)
    score += 10;

  if (ctx.bullishFVG)
    score += 10;

  return score;
}