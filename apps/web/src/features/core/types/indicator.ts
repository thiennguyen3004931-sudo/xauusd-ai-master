export interface IndicatorContext{

    ema20:number;

    ema50:number;

    ema200:number;

    atr:number;

    rsi:number;

    macd:number;

    adx:number;

    volume:number;

    trend:
        |"Bullish"
        |"Bearish"
        |"Sideway";

}