export interface Position{

    id:string;

    symbol:string;

    side:"BUY"|"SELL";

    volume:number;

    entry:number;

    current:number;

    stopLoss:number;

    takeProfit:number;

    profit:number;

}