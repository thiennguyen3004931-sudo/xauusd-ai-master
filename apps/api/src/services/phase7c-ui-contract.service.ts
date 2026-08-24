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
    auto: string[];
    trendWait: string[];
    sidewayWait: string[];
    wait: string[];
    entry: string[];
    hold: string[];
    stopMove: string[];
    partial: string[];
    exit: string[];
  };
  gates: {
    trend: Phase7CUiGate;
    sideway: Phase7CUiGate;
    reversalFilter: "BLOCKING" | "CLEAR";
  };
  status: {
    mt5Connected: boolean;
    accountGuardValid: boolean;
    trendOn: boolean;
    sidewayOn: boolean;
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
    accountMode: "DEMO" | "LIVE";
    demoOnly: boolean;
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
    .replace(/No valid setup/gi, "Chưa có setup hợp lệ")
    .replace(/ENTRY_MODE_BLOCK:\s*/gi, "")
    .replace(/PAUSE_MODE_BLOCKS_NEW_ENTRY/gi, "Bot đang PAUSE; không mở lệnh mới.");
  return text.trim();
}

function isTradingReason(value: string): boolean {
  if (!value) return false;
  return !/(fixed lot|martingale|recovery lot|lot escalation|broker clock|clock offset|position sizing|sizing|lot cap|cap .*lot|configured lot)/i.test(value);
}

function pushUnique(target: string[], raw: unknown, max = 4) {
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

function autoReasons(snapshot: Snapshot): string[] {
  const reasons: string[] = [];
  if (snapshot.mode.active === "AUTO") {
    const confidence = Number.isFinite(Number(snapshot.engine.confidence))
      ? ` (${Number(snapshot.engine.confidence)}%)`
      : "";
    pushUnique(
      reasons,
      `AUTO: regime ${snapshot.engine.regime}${confidence} → chọn ${snapshot.engine.recommendedMode}.`,
    );
    for (const reason of snapshot.engine.reasons) pushUnique(reasons, reason);
  } else {
    pushUnique(reasons, `Bot đang ở chế độ ${snapshot.mode.active}; AUTO không quyết định strategy lúc này.`);
  }
  return reasons.slice(0, 4);
}

function canonicalEntryWaitReason(strategy: "TREND" | "SIDEWAY", event: string, rawReason: unknown): string {
  const upper = event.toUpperCase();
  if (strategy === "TREND") {
    if (upper === "M15_NO_ENTRY_SIGNAL") return "Trend: chưa xuất hiện một trong 3 mẫu nến M15 hợp lệ để xét entry.";
    if (upper === "WAIT_PULLBACK" || upper === "ENTRY_DISTANCE_REGRESSION_WAIT") return "Trend: SL cấu trúc đang lớn hơn 10 giá; chờ pullback để SL trở về vùng 6–10 giá.";
    if (upper.includes("SUPERTREND")) return "Trend: Supertrend M15/M5 chưa cùng hướng với tín hiệu.";
    if (upper === "SIGNAL_EXPIRED") return "Trend: tín hiệu đã hết cửa sổ chờ; đợi setup M15 mới.";
    if (upper.includes("BROKER_DISTANCE")) return "Trend: khoảng SL chưa đáp ứng giới hạn broker; chưa gửi lệnh.";
    if (upper === "ENTRY_MODE_BLOCK") return "Trend: mode hiện tại chưa cho phép Trend mở lệnh mới.";
  } else {
    if (upper === "ENTRY_MODE_BLOCK") return "Sideway: mode/AUTO gate hiện tại chưa cho phép Sideway mở lệnh mới.";
    if (upper === "ENTRY_REGIME_BLOCK") return "Sideway: chỉ xét entry khi regime là RANGING, recommended mode là SIDEWAY và confidence đạt ngưỡng.";
    if (upper === "ENTRY_LOCATION_BLOCK") return "Sideway: giá chưa ở vùng demand/supply đủ gần; giữa range không vào lệnh.";
    if (upper === "ENTRY_M5_CONFIRMATION_BLOCK") return "Sideway: chưa có xác nhận M5 hợp lệ tại vùng vào lệnh.";
    if (upper === "ENTRY_PLAN_BLOCK" || upper === "ENTRY_FINAL_PLAN_BLOCK") return "Sideway: kế hoạch entry chưa đạt điều kiện SL 6–10, TP sau +10 và RR tối thiểu.";
    if (upper === "ENTRY_SPREAD_BLOCK") return "Sideway: spread hiện tại vượt giới hạn cho phép.";
    if (upper.includes("FRESHNESS")) return "Sideway: dữ liệu quote/M5/M15 chưa đủ mới; fail-closed và chờ dữ liệu mới.";
    if (upper === "ENTRY_AUTO_LOT_BLOCK") return "Sideway: Auto Lot snapshot chưa hợp lệ; không gửi lệnh.";
    if (upper === "ENTRY_FINAL_GATE_BLOCK") return "Sideway: final gate thay đổi ngay trước order; setup bị chặn và phải đánh giá lại.";
  }
  return normalizeReason(rawReason || event);
}

function strategyWaitReasons(snapshot: Snapshot, strategy: "TREND" | "SIDEWAY"): string[] {
  const reasons: string[] = [];
  const gate = gateFor(snapshot, strategy);
  if (gate === "BLOCKED_BY_MODE") {
    pushUnique(reasons, `${strategy}: bot mode ${snapshot.mode.active} đang chặn entry mới.`);
  } else if (gate === "BLOCKED_BY_REGIME") {
    pushUnique(reasons, `${strategy}: AUTO hiện chưa chọn ${strategy}; strategy không được phép gửi entry.`);
  }

  for (const row of snapshot.recentDecisions) {
    if (row.strategy !== strategy) continue;
    const event = String(row.event ?? "");
    if (!event) continue;
    if (/(?:EXIT|CLOSE|CLOSED|TAKE_PROFIT|STOP_LOSS|POSITION_GONE|PLUS6|PLUS10|STRUCTURAL_SL|FVG_HOLD|MANAGEMENT_)/i.test(event)) continue;
    pushUnique(reasons, canonicalEntryWaitReason(strategy, event, row.reason));
    if (reasons.length >= 3) break;
  }

  if (snapshot.preTrade.strategy === strategy && !snapshot.preTrade.approved) {
    pushUnique(reasons, snapshot.preTrade.decisionReason);
  }

  if (reasons.length === 0) {
    pushUnique(reasons, `${strategy}: chưa có setup mới đạt toàn bộ entry gate.`);
  }
  return reasons.slice(0, 3);
}

function compatibilityWaitReasons(
  snapshot: Snapshot,
  auto: string[],
  trend: string[],
  sideway: string[],
): string[] {
  if (snapshot.mode.effectiveStrategy === "TREND") return trend.slice(0, 3);
  if (snapshot.mode.effectiveStrategy === "SIDEWAY") return sideway.slice(0, 3);
  return auto.slice(0, 3);
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

function managementReasons(snapshot: Snapshot, kind: "STOP" | "PARTIAL"): string[] {
  if (snapshot.position.count <= 0) return [];
  const reasons: string[] = [];
  const ticket = String(snapshot.position.ticket ?? "");
  for (const row of snapshot.recentDecisions) {
    if (ticket && String(row.management?.ticket ?? "") && String(row.management?.ticket ?? "") !== ticket) continue;
    const event = String(row.event ?? "");
    if (kind === "STOP") {
      if (/^PLUS6_(?:SL_TO_ENTRY|BREAK_EVEN_APPLIED)/.test(event)) {
        pushUnique(reasons, "SL đã được dời về Entry/BE khi lệnh đạt +6 giá.", 2);
      } else if (event === "STRUCTURAL_SL_TIGHTEN") {
        pushUnique(reasons, "SL runner đã được siết theo cấu trúc swing M15 mới; chỉ siết theo hướng có lợi.", 2);
      }
    } else if (/^PLUS10_PARTIAL_ONE_THIRD/.test(event)) {
      pushUnique(reasons, "Đã chốt đúng 1/3 vị thế khi giá đạt mốc +10.", 2);
    }
    if (reasons.length >= 2) break;
  }
  return reasons;
}

function exitReasons(snapshot: Snapshot): string[] {
  const reasons: string[] = [];
  for (const row of snapshot.recentDecisions) {
    const event = String(row.event ?? "");
    if (!/(?:EXIT|CLOSE|CLOSED|TAKE_PROFIT|STOP_LOSS|POSITION_GONE|REGIME_LEFT_RANGE|TIME_STOP)/i.test(event)) continue;
    pushUnique(reasons, row.reason || event, 3);
    if (reasons.length >= 3) break;
  }
  return reasons;
}

export function buildPhase7CUiContract(snapshot: Snapshot): Phase7CUiContract {
  const state = uiState(snapshot);
  const accountMode: "DEMO" | "LIVE" = snapshot.account.accountMode === "real" ? "LIVE" : "DEMO";
  const trendGate = gateFor(snapshot, "TREND");
  const sidewayGate = gateFor(snapshot, "SIDEWAY");
  const auto = autoReasons(snapshot);
  const trendWait = strategyWaitReasons(snapshot, "TREND");
  const sidewayWait = strategyWaitReasons(snapshot, "SIDEWAY");
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
      auto,
      trendWait,
      sidewayWait,
      wait: state === "WAITING" ? compatibilityWaitReasons(snapshot, auto, trendWait, sidewayWait) : [],
      entry: entryReasons(snapshot, state),
      hold: holdReasons(snapshot, state),
      stopMove: managementReasons(snapshot, "STOP"),
      partial: managementReasons(snapshot, "PARTIAL"),
      exit: exitReasons(snapshot),
    },
    gates: {
      trend: trendGate,
      sideway: sidewayGate,
      reversalFilter: snapshot.engine.regime === "REVERSAL" ? "BLOCKING" : "CLEAR",
    },
    status: {
      mt5Connected: snapshot.account.reachable === true,
      accountGuardValid: snapshot.safety.accountGuardValid === true,
      trendOn: trendGate === "ALLOWED",
      sidewayOn: sidewayGate === "ALLOWED",
    },
    setup,
    position,
    safety: {
      accountMode,
      demoOnly: accountMode === "DEMO",
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
  const auto = ui.reasons.auto;
  const trendWait = ui.reasons.trendWait;
  const sidewayWait = ui.reasons.sidewayWait;
  const wait = ui.reasons.wait;
  const entry = ui.reasons.entry;
  const hold = ui.reasons.hold;
  const stopMove = ui.reasons.stopMove;
  const partial = ui.reasons.partial;
  const exit = ui.reasons.exit;
  const setup = ui.setup;
  const position = ui.position;
  const lines: Array<[string, unknown]> = [
    ["version", ui.version],
    ["generatedAt", ui.generatedAt],
    ["symbol", ui.symbol],
    ["uiState", ui.uiState],
    ["accountMode", ui.safety.accountMode],
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
    ["mt5Connected", ui.status.mt5Connected],
    ["accountGuardValid", ui.status.accountGuardValid],
    ["trendOn", ui.status.trendOn],
    ["sidewayOn", ui.status.sidewayOn],
    ["autoReason1", auto[0]],
    ["autoReason2", auto[1]],
    ["autoReason3", auto[2]],
    ["trendWaitReason1", trendWait[0]],
    ["trendWaitReason2", trendWait[1]],
    ["trendWaitReason3", trendWait[2]],
    ["sidewayWaitReason1", sidewayWait[0]],
    ["sidewayWaitReason2", sidewayWait[1]],
    ["sidewayWaitReason3", sidewayWait[2]],
    ["waitReason1", wait[0]],
    ["waitReason2", wait[1]],
    ["waitReason3", wait[2]],
    ["entryReason1", entry[0]],
    ["entryReason2", entry[1]],
    ["entryReason3", entry[2]],
    ["holdReason1", hold[0]],
    ["holdReason2", hold[1]],
    ["holdReason3", hold[2]],
    ["stopMoveReason1", stopMove[0]],
    ["stopMoveReason2", stopMove[1]],
    ["partialReason1", partial[0]],
    ["partialReason2", partial[1]],
    ["exitReason1", exit[0]],
    ["exitReason2", exit[1]],
    ["exitReason3", exit[2]],
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
