export interface TradePlan {

    action:
        "BUY"
        |"SELL"
        |"WAIT";

    confidence:number;

    entry:number;

    stopLoss:number;

    takeProfit1:number;

    takeProfit2:number;

    takeProfit3:number;

    rr:number;

    riskPercent:number;

    lot:number;

    reasons:string[];

}