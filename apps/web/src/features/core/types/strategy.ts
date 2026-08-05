export type StrategyAction =
    |"BUY"
    |"SELL"
    |"WAIT";

export interface StrategyResult{

    strategy:string;

    action:StrategyAction;

}