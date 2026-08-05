export function calculateRR(
  entry: number,
  sl: number,
  tp: number
) {
  const risk = Math.abs(entry - sl);

  const reward = Math.abs(tp - entry);

  return Number((reward / risk).toFixed(2));
}