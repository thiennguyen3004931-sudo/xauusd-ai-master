export interface AISignal {

    action:"BUY"|"SELL"|"WAIT";

    entry:number;

    sl:number;

    tp1:number;

    tp2:number;

    tp3:number;

    rr:number;

    confidence:number;

    reason:string[];

}