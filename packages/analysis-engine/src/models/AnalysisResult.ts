import { Trend } from "./Trend";
import { MarketStructure } from "./MarketStructure";
import { SwingPoint } from "./SwingPoint";

export interface AnalysisResult {

  symbol: string;

  timeframe: string;

  trend: Trend;

  structure: MarketStructure;

  swings: SwingPoint[];

  score: number;

  createdAt: number;

}