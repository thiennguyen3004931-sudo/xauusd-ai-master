export interface TradingViewWebhookPayload {

    symbol:string;

    timeframe:string;

    open:number;

    high:number;

    low:number;

    close:number;

    volume:number;

    openTime:number;

    closeTime:number;

}