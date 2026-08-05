export interface Swing{

    high:number;

    low:number;

}

export interface BOS{

    bullish:boolean;

    bearish:boolean;

}

export interface OrderBlock{

    bullish:boolean;

    bearish:boolean;

}

export interface FairValueGap{

    bullish:boolean;

    bearish:boolean;

}

export interface SMCContext{

    swing:Swing;

    bos:BOS;

    choch:boolean;

    liquidity:boolean;

    orderBlock:OrderBlock;

    fvg:FairValueGap;

}