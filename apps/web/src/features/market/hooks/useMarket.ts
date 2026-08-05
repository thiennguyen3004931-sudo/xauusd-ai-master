import { useEffect } from "react";
import { getMarket } from "../services/market.service";
import { useMarketStore } from "../../../store/market.store";

export function useMarket() {
  const market = useMarketStore((s) => s.market);
  const setMarket = useMarketStore((s) => s.setMarket);

  useEffect(() => {
    if (!market) {
      getMarket().then(setMarket);
    }
  }, [market, setMarket]);

  return market;
}