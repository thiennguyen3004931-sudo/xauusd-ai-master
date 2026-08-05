export interface VolatilityResult {
  high: boolean;
  normal: boolean;
  low: boolean;
}

export function detectVolatility(
  atr: number
): VolatilityResult {
  return {
    high: atr > 8,

    normal: atr >= 4 && atr <= 8,

    low: atr < 4,
  };
}