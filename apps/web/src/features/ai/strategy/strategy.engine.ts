export interface StrategyResult {
  name: string;
}

export function selectStrategy(
  context: any,
  _indicators: any,
  smc: any
): StrategyResult {
  if (
    context.trend === "Bullish" &&
    smc.bos.bullish
  ) {
    return {
      name: "Trend Following",
    };
  }

  if (
    smc.liquidity &&
    smc.choch
  ) {
    return {
      name: "Liquidity Reversal",
    };
  }

  return {
    name: "Wait",
  };
}