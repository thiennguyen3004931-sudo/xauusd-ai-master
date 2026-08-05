import { useEffect } from "react";
import { getCandles } from "../services/candle.service";
import { useCandleStore } from "../store/candle.store";

export function useCandles() {
  const candles = useCandleStore((s) => s.candles);
  const setCandles = useCandleStore((s) => s.setCandles);

  useEffect(() => {
    if (candles.length === 0) {
      getCandles().then(setCandles);
    }
  }, [candles, setCandles]);

  return candles;
}