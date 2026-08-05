import type { Candle } from "../../market/types/candle";

export function calculateADR(
    candles:Candle[]
){

    if(candles.length===0)
        return 0;

    const total=
        candles.reduce(

            (sum,c)=>
                sum+(c.high-c.low),

            0

        );

    return total/candles.length;

}