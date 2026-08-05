import { useQuery } from "@tanstack/react-query";

import { marketService } from "../services/market.service";

export function useMarket() {
  return useQuery({
    queryKey: ["market"],

    queryFn: async () => {
      console.log("Fetching market...");

      const data = await marketService.getQuote();

      console.log("Market API:", data);

      return data;
    },

    refetchInterval: 3000,
  });
}