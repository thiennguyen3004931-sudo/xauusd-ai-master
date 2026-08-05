import { create } from "zustand";
import type { Candle } from "../types/candle";

type CandleState = {
  candles: Candle[];
  setCandles: (candles: Candle[]) => void;
};

export const useCandleStore = create<CandleState>((set) => ({
  candles: [],
  setCandles: (candles) => set({ candles }),
}));