function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Phase7C M5 pre-structure profit-lock adapter could not find ${label}.`);
  }
  return source.replace(search, replacement);
}

function deferTrendHandoffUntilAcceptedM5Tighten(source) {
  source = replaceRequired(
    source,
    `  if (fastMoveStructure !== null && !managed.fastMoveHandedOffToM5) {
    managed.fastMoveHandedOffToM5 = true;
    saveState();
    journal("FAST_MOVE_HANDOFF_M5_STRUCTURE", {
      ticket: managed.ticket,
      side: managed.side,
      structurePrice: fastMoveStructure.price,
      pivotM5CloseTime: fastMoveStructure.pivotCloseTime,
      m5CloseTime: fastMoveStructure.confirmedAt,
    });
  }
  if (!managed.fastMoveHandedOffToM5) {
  if (fastMoveStructure === null) {
`,
    `  if (!managed.fastMoveHandedOffToM5) {
`,
    "Trend premature Fast-Move M5 handoff block",
  );

  source = replaceRequired(
    source,
    "  }\n  }\n  }\n\n  const hold =",
    "  }\n  }\n\n  const hold =",
    "Trend Fast-Move handoff guard closure",
  );

  source = replaceRequired(
    source,
    `      if (response.success) {
        managed.lastStructuralStop = m5Trail.stopLoss;
        saveState();
        journal("M5_STRUCTURAL_SL_TIGHTEN", {
`,
    `      if (response.success) {
        const firstM5Handoff = !managed.fastMoveHandedOffToM5;
        managed.fastMoveHandedOffToM5 = true;
        managed.lastStructuralStop = m5Trail.stopLoss;
        saveState();
        if (firstM5Handoff) {
          journal("FAST_MOVE_HANDOFF_M5_STRUCTURE", {
            ticket: managed.ticket,
            side: managed.side,
            structurePrice: m5Trail.structurePrice,
            pivotM5CloseTime: m5Trail.pivotCloseTime,
            m5CloseTime: m5Trail.confirmedAt,
          });
        }
        journal("M5_STRUCTURAL_SL_TIGHTEN", {
`,
    "Trend successful M5 tighten handoff",
  );

  return source;
}

function deferSidewayHandoffUntilAcceptedM5Tighten(source) {
  source = replaceRequired(
    source,
    `  if (fastMoveStructure !== null && !managed.fastMoveHandedOffToM5) {
    managed.fastMoveHandedOffToM5 = true;
    saveState();
    journal("FAST_MOVE_HANDOFF_M5_STRUCTURE", {
      ticket: managed.ticket,
      side: managed.side,
      structurePrice: fastMoveStructure.price,
      pivotM5CloseTime: fastMoveStructure.pivotCloseTime,
      m5CloseTime: fastMoveStructure.confirmedAt,
    });
  }
  if (!managed.fastMoveHandedOffToM5) {
  if (fastMoveStructure === null) {
`,
    `  if (!managed.fastMoveHandedOffToM5) {
`,
    "Sideway premature Fast-Move M5 handoff block",
  );

  source = replaceRequired(
    source,
    "  }\n  }\n  }\n\n  if (managed.breakEvenApplied && !managed.partialApplied && targetReached(managed.side, marketPrice, managed.tp1)) {",
    "  }\n  }\n\n  if (managed.breakEvenApplied && !managed.partialApplied && targetReached(managed.side, marketPrice, managed.tp1)) {",
    "Sideway Fast-Move handoff guard closure",
  );

  source = replaceRequired(
    source,
    `          if (response.success) {
            managed.lastStructuralStop = m5Trail.stopLoss;
            saveState();
            journal("SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN", {
`,
    `          if (response.success) {
            const firstM5Handoff = !managed.fastMoveHandedOffToM5;
            managed.fastMoveHandedOffToM5 = true;
            managed.lastStructuralStop = m5Trail.stopLoss;
            saveState();
            if (firstM5Handoff) {
              journal("FAST_MOVE_HANDOFF_M5_STRUCTURE", {
                ticket: managed.ticket,
                side: managed.side,
                structurePrice: m5Trail.structurePrice,
                pivotM5CloseTime: m5Trail.pivotCloseTime,
                m5CloseTime: m5Trail.confirmedAt,
              });
            }
            journal("SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN", {
`,
    "Sideway successful M5 tighten handoff",
  );

  return source;
}

export function transformPhase7CTrendM5PreStructureProfitLockSource(input) {
  let source = String(input);

  source = deferTrendHandoffUntilAcceptedM5Tighten(source);
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

  source = deferSidewayHandoffUntilAcceptedM5Tighten(source);
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
