import type { getPhase7CDecisionMonitor } from "./phase7c-decision-monitor.service";

type Snapshot = Awaited<ReturnType<typeof getPhase7CDecisionMonitor>>;
export type Phase7CUiState = "WAITING" | "SETUP_READY" | "MANAGING";
export type Phase7CUiGate = "ALLOWED" | "BLOCKED_BY_MODE" | "BLOCKED_BY_REGIME" | "PENDING";

export interface Phase7CUiContract {
  version: 2;
  generatedAt: number;
  symbol: string;
  uiState: Phase7CUiState;
  mode: string;
  effectiveStrategy: string;
  regime: string;
  confidence: number | null;
  stage: string;
  approved: boolean;
  recommendedMode: string;
  reasons: {
    wait: string[];
    entry: string[];
    hold: string[];
    exit: string[];
  };
  gates: {
    trend: Phase7CUiGate;
    sideway: Phase7CUiGate;
    reversalFilter: "BLOCKING" | "CLEAR";
  };
  setup: null | {
    strategy: string;
    side: string | null;
    name: string | null;
    entry: number | null;
    stopLoss: number | null;
    tp1: number | null;
    tp2: number | null;
    finalLot: number | null;
    estimatedRiskPercent: number | null;
  };
  position: null | {
    state: string;
    strategy: string | null;
    ticket: string | null;
    side: string | null;
    volume: number | null;
    entry: number | null;
    stopLoss: number | null;
    tp1: number | null;
    tp2: number | null;
    floatingPnlUsd: number | null;
    floatingPnlPercent: number | null;
  };
  safety: {
    demoOnly: true;
    readOnly: true;
    orderPermission: "NONE";
    newPositionsOnly: true;
    martingale: false;
    recoveryLotEscalation: false;
  };
}

function normalizeReason(value: unknown): string {
  let text = String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  text = text
    .replace(/A confirmed CHOCH indicates a possible structural reversal\.?/gi, "CHOCH xác nhận khả năng đảo chiều cấu trúc.")
    .replace(/Bollinger bandwidth is\s*/gi, "Bollinger bandwidth: ")
    .replace(/PAUSE chặn mọi lệnh mới; không thay đổi vị thế đang được quản lý\.?/gi, "PAUSE chặn lệnh mới.")
    .replace(/No valid setup/gi, "Chưa có setup hợp lệ");
  return text.trim();
}

function isTradingReason(value: string): boolean {
  if (!value) return false;
  return !/(fixed lot|martingale|recovery lot|lot escalation|broker clock|clock offset|position sizing|sizing|lot cap|cap .*lot|configured lot)/i.test(value);
}

function pushUnique(target: string[], raw: unknown, max = 3) {
  if (target.length >= max) return;
  const reason = normalizeReason(raw);
  if (!reason || !isTradingReason(reason)) return;
  const key = reason.toLocaleLowerCase("vi-VN");
  if (target.some((item) => item.toLocaleLowerCase("vi-VN") === key)) return;
  target.push(reason);
}

function uiState(snapshot: Snapshot): Phase7CUiState {
  if (
    snapshot.position.count > 0 ||
    snapshot.position.state === "MANAGING" ||
    snapshot.position.state === "UNMANAGED"
  ) return "MANAGING";
  if (
    snapshot.preTrade.approved &&
    snapshot.preTrade.entry !== null &&
    snapshot.preTrade.stopLoss !== null
  ) return "SETUP_READY";
  return "WAITING";
}

function gateFor(snapshot: Snapshot, strategy: "TREND" | "SIDEWAY"): Phase7CUiGate {
  if (snapshot.mode.active === "PAUSE") return "BLOCKED_BY_MODE";
  if (snapshot.mode.active === strategy) return "ALLOWED";
  if (snapshot.mode.active === "AUTO") {
    return snapshot.engine.recommendedMode === strategy ? "ALLOWED" : "BLOCKED_BY_REGIME";
  }
  return "BLOCKED_BY_MODE";
}

function waitReasons(snapshot: Snapshot): string[] {
  const reasons: string[] = [];
  if (snapshot.mode.active === "PAUSE") {
    pushUnique(reasons, "Bot đang PAUSE; không mở lệnh mới.");
  } else if (snapshot.preTrade.strategy !== "PAUSE") {
    pushUnique(reasons, snapshot.preTrade.decisionReason);
  }
  for (const reason of snapshot.engine.reasons) pushUnique(reasons, reason);
  if (reasons.length < 3 && snapshot.engine.recommendedMode) {
    pushUnique(reasons, `Regime ${snapshot.engine.regime}; recommended mode ${snapshot.engine.recommendedMode}.`);
  }
  if (reasons.length === 0) pushUnique(reasons, "Chưa có setup hợp lệ; tiếp tục chờ tín hiệu.");
  return reasons.slice(0, 3);
}

function entryReasons(snapshot: Snapshot, state: Phase7CUiState): string[] {
  const reasons: string[] = [];
  if (state === "MANAGING") {
    pushUnique(reasons, snapshot.position.entryReason);
  } else if (state === "SETUP_READY") {
    pushUnique(reasons, snapshot.preTrade.decisionReason);
    if (snapshot.preTrade.setup) pushUnique(reasons, `Setup ${snapshot.preTrade.setup} đã được engine duyệt.`);
  }
  return reasons.slice(0, 3);
}

function holdReasons(snapshot: Snapshot, state: Phase7CUiState): string[] {
  if (state !== "MANAGING") return [];
  const reasons: string[] = [];
  pushUnique(reasons, snapshot.position.holdReason);
  return reasons;
}

export function buildPhase7CUiContract(snapshot: Snapshot): Phase7CUiContract {
  const state = uiState(snapshot);
  const setup = state === "SETUP_READY" ? {
    strategy: snapshot.preTrade.strategy,
    side: snapshot.preTrade.side,
    name: snapshot.preTrade.setup,
    entry: snapshot.preTrade.entry,
    stopLoss: snapshot.preTrade.stopLoss,
    tp1: snapshot.preTrade.tp1,
    tp2: snapshot.preTrade.tp2,
    finalLot: snapshot.preTrade.finalLot,
    estimatedRiskPercent: snapshot.preTrade.estimatedRiskPercent,
  } : null;
  const position = state === "MANAGING" ? {
    state: snapshot.position.state,
    strategy: snapshot.position.strategy,
    ticket: snapshot.position.ticket,
    side: snapshot.position.side,
    volume: snapshot.position.volume,
    entry: snapshot.position.entry,
    stopLoss: snapshot.position.stopLoss,
    tp1: snapshot.position.tp1,
    tp2: snapshot.position.tp2,
    floatingPnlUsd: snapshot.position.floatingPnlUsd,
    floatingPnlPercent: snapshot.position.floatingPnlPercent,
  } : null;

  return {
    version: 2,
    generatedAt: snapshot.generatedAt,
    symbol: snapshot.symbol,
    uiState: state,
    mode: snapshot.mode.active,
    effectiveStrategy: snapshot.mode.effectiveStrategy,
    regime: snapshot.engine.regime,
    confidence: snapshot.engine.confidence,
    stage: snapshot.preTrade.stage,
    approved: snapshot.preTrade.approved,
    recommendedMode: snapshot.engine.recommendedMode,
    reasons: {
      wait: state === "WAITING" ? waitReasons(snapshot) : [],
      entry: entryReasons(snapshot, state),
      hold: holdReasons(snapshot, state),
      exit: [],
    },
    gates: {
      trend: gateFor(snapshot, "TREND"),
      sideway: gateFor(snapshot, "SIDEWAY"),
      reversalFilter: snapshot.engine.regime === "REVERSAL" ? "BLOCKING" : "CLEAR",
    },
    setup,
    position,
    safety: {
      demoOnly: true,
      readOnly: true,
      orderPermission: "NONE",
      newPositionsOnly: true,
      martingale: false,
      recoveryLotEscalation: false,
    },
  };
}

function lineValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "n/a";
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 480);
}

export function formatPhase7CUiContractForMt5(ui: Phase7CUiContract): string {
  const wait = ui.reasons.wait;
  const entry = ui.reasons.entry;
  const hold = ui.reasons.hold;
  const setup = ui.setup;
  const position = ui.position;
  const lines: Array<[string, unknown]> = [
    ["version", ui.version],
    ["generatedAt", ui.generatedAt],
    ["symbol", ui.symbol],
    ["uiState", ui.uiState],
    ["activeMode", ui.mode],
    ["effectiveStrategy", ui.effectiveStrategy],
    ["regime", ui.regime],
    ["confidence", ui.confidence],
    ["stage", ui.stage],
    ["approved", ui.approved],
    ["recommendedMode", ui.recommendedMode],
    ["trendGate", ui.gates.trend],
    ["sidewayGate", ui.gates.sideway],
    ["reversalFilter", ui.gates.reversalFilter],
    ["waitReason1", wait[0]],
    ["waitReason2", wait[1]],
    ["waitReason3", wait[2]],
    ["entryReason1", entry[0]],
    ["entryReason2", entry[1]],
    ["entryReason3", entry[2]],
    ["holdReason1", hold[0]],
    ["holdReason2", hold[1]],
    ["holdReason3", hold[2]],
    ["setupStrategy", setup?.strategy],
    ["setupSide", setup?.side],
    ["setupName", setup?.name],
    ["setupEntry", setup?.entry],
    ["setupStopLoss", setup?.stopLoss],
    ["setupTp1", setup?.tp1],
    ["setupTp2", setup?.tp2],
    ["setupFinalLot", setup?.finalLot],
    ["setupRiskPercent", setup?.estimatedRiskPercent],
    ["positionState", position?.state],
    ["positionStrategy", position?.strategy],
    ["ticket", position?.ticket],
    ["positionSide", position?.side],
    ["positionVolume", position?.volume],
    ["positionEntry", position?.entry],
    ["positionStopLoss", position?.stopLoss],
    ["positionTp1", position?.tp1],
    ["positionTp2", position?.tp2],
    ["floatingPnlUsd", position?.floatingPnlUsd],
    ["floatingPnlPercent", position?.floatingPnlPercent],
    ["demoOnly", ui.safety.demoOnly],
    ["readOnly", ui.safety.readOnly],
    ["newPositionsOnly", ui.safety.newPositionsOnly],
    ["martingale", ui.safety.martingale],
    ["recoveryLotEscalation", ui.safety.recoveryLotEscalation],
    ["mt5OrderPermission", ui.safety.orderPermission],
  ];
  return `${lines.map(([key, value]) => `${key}=${lineValue(value)}`).join("\n")}\n`;
}
