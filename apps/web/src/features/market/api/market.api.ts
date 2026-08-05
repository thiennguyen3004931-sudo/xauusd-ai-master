  import { api } from "../../../core/api/api";

  export async function getQuote() {
    const res = await api.get("/market/quote");
    return res.data.data;
  }

  export async function getCandles(limit = 500) {
    const res = await api.get("/market/candles", {
      params: {
        symbol: "XAUUSD",
        tf: "M5",
        limit,
      },
    });

    return res.data.data;
  }