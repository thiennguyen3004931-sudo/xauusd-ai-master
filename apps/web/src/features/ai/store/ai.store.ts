import { create } from "zustand";
import type { AISignal } from "../types/ai";

type AIState = {
  signal: AISignal | null;
  setSignal: (signal: AISignal) => void;
};

export const useAIStore = create<AIState>((set) => ({
  signal: null,

  setSignal: (signal) =>
    set({
      signal,
    }),
}));