import { Candle } from "@xauusd/market-data";

import { Detector } from "../detectors/Detector";
import { AnalysisResult } from "../models/AnalysisResult";

export class AnalysisPipeline {

  constructor(
    private readonly detectors: Detector[]
  ) {}

  async run(
    candles: Candle[],
    result: AnalysisResult
  ): Promise<AnalysisResult> {

    for (const detector of this.detectors) {
      await detector.detect(candles, result);
    }

    return result;

  }

}