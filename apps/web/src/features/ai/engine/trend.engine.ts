import type { MarketData } from "../../market/types/market";

export function detectTrend(
    market: MarketData
): "BUY" | "SELL" | "WAIT" {

    if (market.trend === "Bullish") {
        return "BUY";
    }

    if (market.trend === "Bearish") {
        return "SELL";
    }

    return "WAIT";
}