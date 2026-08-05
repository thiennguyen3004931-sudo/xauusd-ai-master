import { useEffect } from "react";

import { useAIStore } from "../store/ai.store";
import { getAISignal } from "../services/ai.service";

import { useMarket } from "../../market/hooks/useMarket";
import { useCandles } from "../../market/hooks/useCandles";

export function useAI() {
  const signal = useAIStore((s) => s.signal);
  const setSignal = useAIStore((s) => s.setSignal);

  const { data: market } = useMarket();
  const { data: candles } = useCandles();

  useEffect(() => {
    if (!market || !candles) {
      return;
    }

    const aiSignal = getAISignal(
      market,
      candles
    );

    setSignal(aiSignal);

  }, [market, candles, setSignal]);

  return signal;
}