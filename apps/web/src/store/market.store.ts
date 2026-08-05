import { create } from "zustand";
import type { MarketData } from "../features/market/types/market";

type MarketState = {
  market: MarketData | null;
  setMarket: (market: MarketData) => void;
};

export const useMarketStore = create<MarketState>((set) => ({
  market: null,

  setMarket: (market) =>
    set({
      market,
    }),
}));