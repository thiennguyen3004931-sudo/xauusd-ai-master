import { Candle } from "@xauusd/market-data";
import { AnalysisResult } from "../models/AnalysisResult";

export interface Detector {

  detect(
    candles: Candle[],
    result: AnalysisResult
  ): Promise<void>;

}