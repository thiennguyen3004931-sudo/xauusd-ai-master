import type { AISignal } from "../types/ai";

export function generateSignal():AISignal{

    return{

        action:"BUY",

        entry:3367,

        sl:3361,

        tp1:3374,

        tp2:3382,

        tp3:3390,

        rr:3,

        confidence:91,

        reason:[

            "Bullish Trend",

            "Order Block",

            "Fair Value Gap",

            "Liquidity Sweep",

        ],

    };

}