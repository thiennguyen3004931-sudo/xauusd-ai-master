import { useEffect, useState } from "react";
import { getMarket } from "../services/market.service";
import type { MarketData } from "../types/market";

export function useMarket() {
  const [data, setData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMarket()
      .then(setData)
      .finally(() => setIsLoading(false));
  }, []);

  return {
    data,
    isLoading,
  };
}