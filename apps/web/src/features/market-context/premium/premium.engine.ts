import type { Candle } from "../../market/types/candle";

export function detectPremiumDiscount(
    candles:Candle[]
){

    if(!candles.length){

        return{

            premium:false,

            discount:false

        };

    }

    const high=Math.max(
        ...candles.map(c=>c.high)
    );

    const low=Math.min(
        ...candles.map(c=>c.low)
    );

    const current=
        candles[candles.length-1].close;

    const mid=
        (high+low)/2;

    return{

        premium:
            current>mid,

        discount:
            current<mid

    };

}