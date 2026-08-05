import { useEffect } from "react";
import { useAIStore } from "../store/ai.store";
import { getAISignal } from "../services/ai.service";

export function useAI() {
  const signal = useAIStore((s) => s.signal);
  const setSignal = useAIStore((s) => s.setSignal);

  useEffect(() => {
    if (!signal) {
      getAISignal().then(setSignal);
    }
  }, [signal, setSignal]);

  return signal;
}