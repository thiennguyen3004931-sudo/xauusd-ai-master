const CONTRACT = Object.freeze({
  entryPolicy: "MANUAL_ONLY",
  initialStopDistance: 6,
  fixedTakeProfitDistance: 20,
  plus6Action: "SL_TO_ENTRY_ONLY",
  plus10Action: "PARTIAL_ONE_THIRD",
  managementStrategy: "TREND",
  fastMoveInherited: true,
  structuralExitInherited: true,
  reversalExitInherited: true,
  holdReasonInherited: true,
});

function fail(message) {
  throw new Error(`[PHASE7C_SEMI_POST_ENTRY_CONTRACT] ${message}`);
}

function requireSource(name, source) {
  if (typeof source !== "string" || source.length === 0) {
    fail(`${name} source is required`);
  }
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    fail(`${label} missing: ${needle}`);
  }
}

function requireOrdered(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    fail(`${label} order mismatch`);
  }
  return { firstIndex, secondIndex };
}

export function assertPhase7CSemiPostEntryContract({
  legacyTrendSource,
  transformedTrendSource,
  semiAdoptionRuntimeSource,
  trendWrapperSource,
}) {
  requireSource("legacyTrendSource", legacyTrendSource);
  requireSource("transformedTrendSource", transformedTrendSource);
  requireSource("semiAdoptionRuntimeSource", semiAdoptionRuntimeSource);
  requireSource("trendWrapperSource", trendWrapperSource);

  // SEMI must stay manual-entry-only. Once an eligible manual position is
  // adopted, only management is delegated to the canonical Trend path.
  requireIncludes(trendWrapperSource, 'decision.activeMode === "SEMI"', "SEMI mode branch");
  requireIncludes(
    trendWrapperSource,
    'reason: "SEMI_MANUAL_ENTRY_ONLY"',
    "SEMI manual-entry-only boundary",
  );
  requireIncludes(
    trendWrapperSource,
    "await managePosition(semiAdoption.position, semiAdoption.decision ?? decision);",
    "SEMI Trend management handoff",
  );

  // Adoption protection is fail-closed and establishes SL=6. Fixed TP is
  // supplied by the canonical Trend configuration; its default 20-distance is
  // separately locked by the management-plan contract in this same CI suite.
  requireIncludes(
    semiAdoptionRuntimeSource,
    "const INITIAL_STOP_DISTANCE = 6;",
    "SEMI initial stop distance",
  );
  requireIncludes(
    semiAdoptionRuntimeSource,
    "initialStopDistance: INITIAL_STOP_DISTANCE",
    "SEMI adoption stop wiring",
  );
  requireIncludes(
    semiAdoptionRuntimeSource,
    "trendFixedTpDistance",
    "SEMI Trend fixed-TP input",
  );
  requireIncludes(
    semiAdoptionRuntimeSource,
    "fixedTakeProfit = desiredFixedTakeProfit(",
    "SEMI broker fixed-TP protection",
  );
  requireIncludes(
    semiAdoptionRuntimeSource,
    "fixedTpDistance: trendFixedTpDistance",
    "SEMI managed-state fixed-TP wiring",
  );
  requireIncludes(semiAdoptionRuntimeSource, 'status: "MANAGING"', "SEMI managing state");

  const plus6Marker = "if (!managed.breakEvenApplied && favorable >= 6)";
  const plus10Marker = "if (!managed.partialApplied && favorable >= 10)";
  const { firstIndex: plus6Index, secondIndex: plus10Index } = requireOrdered(
    legacyTrendSource,
    plus6Marker,
    plus10Marker,
    "Trend +6/+10 milestones",
  );

  const plus6Segment = legacyTrendSource.slice(plus6Index, plus10Index);
  requireIncludes(
    plus6Segment,
    "const beStop = roundPrice(position.entry, spec.digits);",
    "Trend +6 BE stop",
  );
  requireIncludes(plus6Segment, "PLUS6_SL_TO_ENTRY", "Trend +6 BE journal");
  if (plus6Segment.includes("partialVolume(")) {
    fail("Trend +6 must not perform partial close");
  }

  const plus10Segment = legacyTrendSource.slice(plus10Index);
  requireIncludes(
    plus10Segment,
    "const closeVolume = partialVolume(managed.initialVolume, position.volume, spec);",
    "Trend +10 partial close",
  );
  requireIncludes(plus10Segment, "PLUS10_PARTIAL_ONE_THIRD", "Trend +10 partial journal");
  requireIncludes(legacyTrendSource, "const raw = initial / 3;", "Trend one-third sizing");

  // Verify the runtime source transformation preserves the management engine
  // invariants rather than only proving them in the Phase7B source template.
  for (const [needle, label] of [
    [plus6Marker, "transformed Trend +6 milestone"],
    [plus10Marker, "transformed Trend +10 milestone"],
    ["const raw = initial / 3;", "transformed Trend one-third sizing"],
    ["fastMoveProfitLockCandidate({", "transformed Trend FastMove"],
    ["latestConfirmedStructureStop({", "transformed Trend structural exit"],
    ['decision.volume.type === "REVERSAL"', "transformed Trend reversal exit"],
    ['canonicalHoldReason("TREND"', "transformed Trend hold reason"],
  ]) {
    requireIncludes(transformedTrendSource, needle, label);
  }

  // Also pin these behaviors in the canonical template to make failures easier
  // to diagnose when the source adapter itself is not the source of drift.
  requireIncludes(legacyTrendSource, "fastMoveProfitLockCandidate({", "Trend FastMove");
  requireIncludes(legacyTrendSource, "latestConfirmedStructureStop({", "Trend structural exit");
  requireIncludes(legacyTrendSource, 'decision.volume.type === "REVERSAL"', "Trend reversal exit");
  requireIncludes(legacyTrendSource, 'canonicalHoldReason("TREND"', "Trend hold reason");

  return {
    ok: true,
    contract: { ...CONTRACT },
  };
}
