import { OrderSide } from "@xauusd/types";
import type {
  EntryCompressionRequest,
  InstrumentRiskSpec,
  Phase4M5Bar,
} from "../models";
import { Phase4M5CandidateService } from "./Phase4M5CandidateService";
import {
  Phase4ReplayResearchService,
  type Phase4ReplayCase,
  type Phase4ReplayResearchResult,
} from "./Phase4ReplayResearchService";

export interface Phase4CanonicalReplayCaseInput {
  id: string;
  side: OrderSide;
  canonicalEntry: number;
  canonicalStopLoss: number;
  signalTimestamp: number;
  expiresAt: number;
  effectiveRiskCapUsd: number;
  instrument: InstrumentRiskSpec;
  m5Bars: readonly Phase4M5Bar[];
  maxM5Bars?: number;
}

export class Phase4CanonicalReplayAdapter {
  private readonly cases: Phase4ReplayCase[] = [];

  constructor(
    private readonly candidateService = new Phase4M5CandidateService(),
    private readonly researchService = new Phase4ReplayResearchService(),
  ) {}

  add(input: Phase4CanonicalReplayCaseInput): void {
    const side = input.side === OrderSide.BUY ? "BUY" : "SELL";
    const built = this.candidateService.build({
      bars: input.m5Bars,
      signalTimestamp: input.signalTimestamp,
      expiresAt: input.expiresAt,
      canonicalEntry: input.canonicalEntry,
      side,
      maxBars: input.maxM5Bars,
    });

    const request: EntryCompressionRequest = {
      side: input.side,
      canonicalEntry: input.canonicalEntry,
      canonicalStopLoss: input.canonicalStopLoss,
      canonicalSignalTime: input.signalTimestamp,
      expiresAt: input.expiresAt,
      effectiveRiskCapUsd: input.effectiveRiskCapUsd,
      instrument: input.instrument,
      candidates: built.candidates,
    };

    this.cases.push({ id: input.id, request });
  }

  result(): Phase4ReplayResearchResult {
    return this.researchService.run(this.cases);
  }

  formatCounters(): string[] {
    const result = this.result();
    return this.researchService.formatCounters(result.counters);
  }

  get size(): number {
    return this.cases.length;
  }
}
