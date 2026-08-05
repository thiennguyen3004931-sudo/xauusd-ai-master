export function makeDecision(
  trend: "BUY" | "SELL" | "WAIT",
  confidence: number
): "BUY" | "SELL" | "WAIT" {

  if (confidence < 70) {
    return "WAIT";
  }

  return trend;
}