export function eventTimeMs(row) {
  if (!row || typeof row !== "object") return null;
  const candidates = [row.timestamp, row.timestampMs, row.createdAt, row.openedAt];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function filterWindow(rows, fromMs, toMs) {
  return rows.filter((row) => {
    const time = eventTimeMs(row);
    return time !== null && time >= fromMs && time <= toMs;
  });
}

export function dedupeAutoDecisions(rows, duplicateWindowMs = 30_000) {
  const sorted = rows
    .filter((row) => row?.type === "AUTO_DECISION" && eventTimeMs(row) !== null)
    .slice()
    .sort((a, b) => eventTimeMs(a) - eventTimeMs(b));
  const result = [];
  let previousFingerprint = null;
  let previousTime = null;

  for (const row of sorted) {
    const time = eventTimeMs(row);
    const reasons = Array.isArray(row?.reasons) ? row.reasons.map(String).slice().sort() : [];
    const fingerprint = JSON.stringify({
      activeMode: row?.activeMode ?? null,
      regime: row?.regime ?? null,
      recommendedMode: row?.recommendedMode ?? null,
      confidence: finiteNumber(row?.confidence),
      lastCandleCloseTime: finiteNumber(row?.lastCandleCloseTime),
      reasons,
    });
    const duplicate =
      previousFingerprint === fingerprint &&
      previousTime !== null &&
      time - previousTime >= 0 &&
      time - previousTime <= duplicateWindowMs;
    if (duplicate) continue;
    result.push(row);
    previousFingerprint = fingerprint;
    previousTime = time;
  }
  return result;
}

export function countByType(rows) {
  const counts = {};
  for (const row of rows) {
    const type = String(row?.type ?? "UNKNOWN");
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return sortObjectByValue(counts);
}

export function blockedReasonCounts(rows) {
  const counts = {};
  for (const row of rows) {
    const type = String(row?.type ?? "");
    if (!/(BLOCK|REJECTED|EXPIRED|NO_ENTRY_SIGNAL|INVALID|UNMANAGED|ERROR)/.test(type)) continue;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return sortObjectByValue(counts);
}

export function nearestDecision(decisions, atMs) {
  let selected = null;
  for (const row of decisions) {
    const time = eventTimeMs(row);
    if (time === null || time > atMs) continue;
    if (selected === null || time > eventTimeMs(selected)) selected = row;
  }
  return selected;
}

export function buildEntryRows(trendRows, sidewayRows, decisions) {
  const entries = [];
  for (const [strategy, rows] of [["TREND", trendRows], ["SIDEWAY", sidewayRows]]) {
    for (const row of rows) {
      if (row?.type !== "ENTRY_FILLED") continue;
      const timestamp = eventTimeMs(row);
      if (timestamp === null) continue;
      const position = row.position ?? {};
      const decision = nearestDecision(decisions, timestamp);
      entries.push({
        timestamp,
        timestampIso: new Date(timestamp).toISOString(),
        strategy,
        ticket: String(position.ticket ?? row.ticket ?? ""),
        side: String(position.side ?? row.side ?? row.management?.side ?? ""),
        volume: finiteNumber(position.volume ?? row.management?.initialVolume),
        entryPrice: finiteNumber(position.entry ?? row.fillPrice ?? row.management?.entry),
        regime: decision?.regime ?? null,
        recommendedMode: decision?.recommendedMode ?? null,
        activeMode: decision?.activeMode ?? null,
        confidence: finiteNumber(decision?.confidence),
      });
    }
  }
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

export function summarizeDeals(deals, trendMagic, sidewayMagic, window = {}) {
  const summary = {
    TREND: emptyDealSummary(),
    SIDEWAY: emptyDealSummary(),
    OTHER: emptyDealSummary(),
  };

  // Close/modify commands in the bridge use its configured magic number, which
  // may differ from the strategy-specific magic used to open a Sideway trade.
  // Establish ownership from opening deals across the supplied ownership
  // lookback, then count only deals inside the requested report window.
  const positionOwners = new Map();
  const positionOpenTimes = new Map();
  for (const deal of deals) {
    if (!deal?.isTradingDeal) continue;
    const entry = String(deal.entry ?? "");
    if (!["IN", "INOUT"].includes(entry)) continue;
    const owner = classifyDealOwner(deal, trendMagic, sidewayMagic);
    const positionId = String(deal.positionId ?? "");
    const timestamp = eventTimeMs(deal);
    if (positionId && owner !== "OTHER") positionOwners.set(positionId, owner);
    if (positionId && timestamp !== null) {
      const current = positionOpenTimes.get(positionId);
      if (current === undefined || timestamp < current) positionOpenTimes.set(positionId, timestamp);
    }
  }

  const fromMs = finiteNumber(window.fromMs);
  const toMs = finiteNumber(window.toMs);
  const requirePositionOpenedInWindow = Boolean(window.requirePositionOpenedInWindow);
  for (const deal of deals) {
    if (!deal?.isTradingDeal) continue;
    const timestamp = eventTimeMs(deal);
    if (fromMs !== null && (timestamp === null || timestamp < fromMs)) continue;
    if (toMs !== null && (timestamp === null || timestamp > toMs)) continue;

    const positionId = String(deal.positionId ?? "");
    if (requirePositionOpenedInWindow && fromMs !== null) {
      if (positionId) {
        const openedAt = positionOpenTimes.get(positionId);
        if (openedAt === undefined || openedAt < fromMs) continue;
      } else {
        const entry = String(deal.entry ?? "");
        if (!["IN", "INOUT"].includes(entry)) continue;
      }
    }

    const bucket = positionOwners.get(positionId) ?? classifyDealOwner(deal, trendMagic, sidewayMagic);
    const target = summary[bucket];
    target.deals += 1;
    target.volume += finiteNumber(deal.volume) ?? 0;
    target.profit += finiteNumber(deal.profit) ?? 0;
    target.commission += finiteNumber(deal.commission) ?? 0;
    target.swap += finiteNumber(deal.swap) ?? 0;
    target.fee += finiteNumber(deal.fee) ?? 0;
    target.netPnl += finiteNumber(deal.netPnl) ?? 0;
    if (String(deal.entry) === "IN") target.entryDeals += 1;
    if (["OUT", "OUT_BY", "INOUT"].includes(String(deal.entry))) target.exitDeals += 1;
  }
  for (const value of Object.values(summary)) roundSummary(value);
  return summary;
}

export function regimeDistribution(decisions) {
  const regime = {};
  const recommended = {};
  const active = {};
  for (const row of decisions) {
    if (row?.type !== "AUTO_DECISION") continue;
    increment(regime, String(row.regime ?? "UNKNOWN"));
    increment(recommended, String(row.recommendedMode ?? "UNKNOWN"));
    increment(active, String(row.activeMode ?? "UNKNOWN"));
  }
  return {
    regime: sortObjectByValue(regime),
    recommendedMode: sortObjectByValue(recommended),
    activeMode: sortObjectByValue(active),
  };
}

function classifyDealOwner(deal, trendMagic, sidewayMagic) {
  const magic = Number(deal?.magic);
  if (magic === sidewayMagic) return "SIDEWAY";
  if (magic === trendMagic) return "TREND";
  const comment = String(deal?.comment ?? "").toLowerCase();
  if (comment.includes("phase7c-sideway") || comment.includes("p7c-sideway")) return "SIDEWAY";
  if (comment.includes("phase7b-demo") || comment.includes("p7b-")) return "TREND";
  return "OTHER";
}

function emptyDealSummary() {
  return { deals: 0, entryDeals: 0, exitDeals: 0, volume: 0, profit: 0, commission: 0, swap: 0, fee: 0, netPnl: 0 };
}

function roundSummary(value) {
  for (const key of ["volume", "profit", "commission", "swap", "fee", "netPnl"]) {
    value[key] = Math.round((Number(value[key]) + Number.EPSILON) * 10000) / 10000;
  }
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function sortObjectByValue(input) {
  return Object.fromEntries(Object.entries(input).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
