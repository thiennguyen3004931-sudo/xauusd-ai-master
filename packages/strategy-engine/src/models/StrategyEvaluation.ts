import type { StrategyResult } from "@xauusd/types";
import type { MarketRegimeAssessment } from "./MarketRegimeAssessment";
import type { StrategyAction } from "./StrategyAction";
import type { StrategyDiagnostics } from "./StrategyDiagnostics";
import type { StrategyPlan } from "./StrategyPlan";
import type { StrategyRuleResult } from "./StrategyRuleResult";
import type { StrategySelection } from "./StrategySelection";

export interface StrategyEvaluation {
  action: StrategyAction;
  plan: StrategyPlan | null;
  regime: MarketRegimeAssessment;
  selection: StrategySelection;
  rules: StrategyRuleResult[];
  diagnostics: StrategyDiagnostics;
  commonResult: StrategyResult;
  generatedAt: number;
}
