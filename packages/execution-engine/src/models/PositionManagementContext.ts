import type { StrategyPlan } from "@xauusd/strategy-engine";
import type { Position } from "@xauusd/types";
import type { ExecutionQuote } from "./ExecutionQuote";
import type { PositionManagementState } from "./PositionManagementState";
import type { SymbolExecutionSpec } from "./SymbolExecutionSpec";
import type { TrendStructureSnapshot } from "./TrendStructureSnapshot";

export interface PositionManagementContext {
  plan: StrategyPlan;
  position: Position;
  quote: ExecutionQuote;
  spec: SymbolExecutionSpec;
  atr: number;
  state: PositionManagementState;
  trendStructure?: TrendStructureSnapshot;
  evaluatedAt?: number;
}