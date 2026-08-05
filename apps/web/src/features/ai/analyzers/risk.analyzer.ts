export function analyzeRisk(
  entry: number,
  sl: number,
  tp: number
) {
  const risk = Math.abs(entry - sl);

  const reward = Math.abs(tp - entry);

  return {
    rr: Number(
      (reward / risk).toFixed(2)
    ),

    risk,
    reward,
  };
}