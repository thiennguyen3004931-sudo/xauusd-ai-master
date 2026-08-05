import { useCandles } from "../../market/hooks/useCandles";

import { calculateEMA } from "../ema/ema";
import { calculateATR } from "../atr/atr";
import { calculateRSI } from "../rsi/rsi";

export function useIndicators() {
  const {
    data: candles = [],
    isLoading,
    error,
  } = useCandles();

  return {
    candles,

    isLoading,

    error,

    ema20: calculateEMA(candles, 20),

    ema50: calculateEMA(candles, 50),

    atr: calculateATR(candles),

    rsi: calculateRSI(candles),
  };
}