function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Phase7C M5 pre-structure profit-lock adapter could not find ${label}.`);
  }
  return source.replace(search, replacement);
}

export function transformPhase7CTrendM5PreStructureProfitLockSource(input) {
  let source = String(input);

  source = replaceRequired(
    source,
    "const FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE = 6;",
    "const FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE = 10;",
    "Trend Fast-Move giveback constant",
  );
  source = replaceRequired(
    source,
    "  const fastMove = fastMoveProfitLockCandidate({",
    `  const fastMoveEligible = stopIsAtLeastAsTight(
    managed.side,
    Number(position.stopLoss),
    Number(position.entry),
  );
  const fastMove = fastMoveProfitLockCandidate({`,
    "Trend Fast-Move eligibility insertion point",
  );
  source = replaceRequired(
    source,
    "  if (fastMove.active) {",
    "  if (fastMove.active && fastMoveEligible) {",
    "Trend Fast-Move mutation gate",
  );

  return source;
}

export function transformPhase7CSidewayM5PreStructureProfitLockSource(input) {
  let source = String(input);

  source = replaceRequired(
    source,
    "const FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE = 4;",
    "const FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE = 10;",
    "Sideway Fast-Move giveback constant",
  );
  source = replaceRequired(
    source,
    "  const fastMove = fastMoveProfitLockCandidate({",
    `  const fastMoveEligible = stopIsAtLeastAsTight(
    managed.side,
    Number(position.stopLoss),
    Number(managed.entry),
  );
  const fastMove = fastMoveProfitLockCandidate({`,
    "Sideway Fast-Move eligibility insertion point",
  );
  source = replaceRequired(
    source,
    "  if (fastMove.active) {",
    "  if (fastMove.active && fastMoveEligible) {",
    "Sideway Fast-Move mutation gate",
  );

  return source;
}
