export function makeDecision(
  score: number
) {

  if (score >= 85)
    return "STRONG_BUY";

  if (score >= 70)
    return "BUY";

  if (score >= 50)
    return "WAIT";

  if (score >= 30)
    return "SELL";

  return "STRONG_SELL";

}