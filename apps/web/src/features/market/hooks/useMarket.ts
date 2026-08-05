import { useQuery } from "@tanstack/react-query";

import { marketService } from "../services/market.service";

export function useMarket() {
  return useQuery({
    queryKey: ["market"],

    queryFn: () => marketService.getQuote(),

    refetchInterval: 3000,
  });
}