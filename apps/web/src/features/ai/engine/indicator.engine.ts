export function emaTrend(price:number, ema200:number){

    return price>ema200
        ?"Bullish"
        :"Bearish";

}