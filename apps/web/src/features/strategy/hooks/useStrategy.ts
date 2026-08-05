import { runStrategy } from "../engine/strategy.engine";

import type { StrategyContext } from "../types/strategy";

export function useStrategy(ctx: StrategyContext) {
  return runStrategy(ctx);
}