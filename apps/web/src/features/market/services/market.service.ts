import * as api from "../api/market.api";

export const marketService = {

  getQuote() {
    return api.getQuote();
  },

  getCandles(limit?: number) {
    return api.getCandles(limit);
  },

};