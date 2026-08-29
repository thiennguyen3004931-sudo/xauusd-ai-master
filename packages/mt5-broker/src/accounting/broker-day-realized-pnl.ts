import type { Mt5BridgeDeal } from "../models/Mt5BridgeDeal";

export function computeBrokerDayRealizedPnl(
  deals: readonly Mt5BridgeDeal[],
  systemMagicNumbers: Iterable<number>,
): number {
  const ownedMagics = new Set(
    Array.from(systemMagicNumbers, (magic) => Number(magic)),
  );

  return deals
    .filter(
      (deal) =>
        deal.isTradingDeal === true &&
        ownedMagics.has(Number(deal.magic)),
    )
    .reduce((sum, deal) => sum + Number(deal.netPnl || 0), 0);
}
