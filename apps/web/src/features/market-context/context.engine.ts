import type { Candle } from "../market/types/candle";
import type { MarketData } from "../market/types/market";

import type { MarketContext } from "./types/context";

import { detectSession } from "./session/session.engine";
import { calculateADR } from "./adr/adr.engine";
import { detectPremiumDiscount } from "./premium/premium.engine";
import { detectTrend } from "../indicators/trend/trend";
import { detectVolatility } from "../indicators/volatility/volatility";

export function buildMarketContext(
    market:MarketData,
    candles:Candle[]
):MarketContext{

    const trend=
        detectTrend(candles);

    const adr=
        calculateADR(candles);

    const premium=
        detectPremiumDiscount(candles);

    const hour=
        new Date().getHours();

    return{

        trend:
            trend.bullish
                ?"Bullish"
                :trend.bearish
                ?"Bearish"
                :"Sideway",

        session:
            detectSession(hour),

        dailyBias:"Neutral",

        weeklyBias:"Neutral",

        volatility:
            detectVolatility(adr),

        adr,

        spread:
            market.spread,

        premium:
            premium.premium,

        discount:
            premium.discount

    };

}