export interface ScoreResult {

  score: number;

  confidence: number;

  reasons: string[];

}

export function calculateScore(
  indicators: any,
  smc: any
): ScoreResult {

  let score = 0;

  const reasons: string[] = [];

  if (indicators.trend.bullish) {
    score += 20;
    reasons.push("Bullish Trend");
  }

  if (indicators.crossover.bullish) {
    score += 15;
    reasons.push("EMA20 > EMA50");
  }

  if (smc.bos.bullish) {
    score += 20;
    reasons.push("Bullish BOS");
  }

  if (smc.orderBlock.bullish) {
    score += 10;
    reasons.push("Bullish Order Block");
  }

  if (smc.fvg.bullishFVG) {
    score += 5;
    reasons.push("Bullish FVG");
  }

  return {
    score,
    confidence: Math.min(score, 100),
    reasons,
  };
}