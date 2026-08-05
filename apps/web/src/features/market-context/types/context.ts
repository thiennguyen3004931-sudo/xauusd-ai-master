export interface MarketContext {

    trend:
        "Bullish"
        |"Bearish"
        |"Sideway";

    session:
        "Asian"
        |"London"
        |"NewYork";

    dailyBias:
        "Bullish"
        |"Bearish"
        |"Neutral";

    weeklyBias:
        "Bullish"
        |"Bearish"
        |"Neutral";

    volatility:{
        high:boolean;
        normal:boolean;
        low:boolean;
    };

    adr:number;

    spread:number;

    premium:boolean;

    discount:boolean;

}