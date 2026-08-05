import type { IndicatorContext } from "./indicator";
import type { MarketContext } from "./market";
import type { RiskResult } from "./risk";
import type { ScoreResult } from "./score";
import type { SMCContext } from "./smc";
import type { StrategyResult } from "./strategy";
import type { TradePlan } from "./planner";

export interface AISignal{

    market:MarketContext;

    indicators:IndicatorContext;

    smc:SMCContext;

    strategy:StrategyResult;

    score:ScoreResult;

    risk:RiskResult;

    trade:TradePlan;

    createdAt:number;

}