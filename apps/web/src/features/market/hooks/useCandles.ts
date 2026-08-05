import { useQuery } from "@tanstack/react-query";

import { marketService } from "../services/market.service";

export function useCandles(limit = 500) {
  return useQuery({
    queryKey: ["candles", limit],

    queryFn: () =>
      marketService.getCandles(limit),

    refetchInterval: 5000,
  });
}