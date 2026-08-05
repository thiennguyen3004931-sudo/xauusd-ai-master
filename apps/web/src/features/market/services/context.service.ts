import { getCandles } from "./candle.service";

import { getQuote } from "./quote.service";

export async function getMarketContext(){

    const market =
        await getQuote("XAUUSD");

    const candles =
        await getCandles(

            "XAUUSD",

            "M5",

            500

        );

    return{

        market,

        candles,

    };

}