const RUNTIME_IMPORT = `import {
  reconcilePhase7CSemiManualPosition,
  markPhase7CSemiManualAdoptionClosed,
} from "./phase7c-semi-trend-adoption-runtime.mjs";\n`;

const LEGACY_UNMANAGED_BLOCK = `  if (positions.length > 0) {
    journal("UNMANAGED_POSITION_PRESENT", { positions: positions.map((p) => ({ ticket: p.ticket, side: p.side, volume: p.volume })) });
    return;
  }
`;

const SEMI_UNMANAGED_BLOCK = `  if (positions.length > 0) {
    const semiAdoption = await reconcilePhase7CSemiManualPosition({
      symbol,
      trendFixedTpEnabled,
      trendFixedTpDistance,
      latestM15CloseTime: m15.at(-1)?.closeTime ?? 0,
      systemMagicNumber: magicNumber,
    });

    if (
      semiAdoption?.status === "ADOPTED" &&
      semiAdoption.managed &&
      semiAdoption.position
    ) {
      state.managed = semiAdoption.managed;
      saveState();
      journal("SEMI_MANUAL_POSITION_ADOPTED", {
        ticket: semiAdoption.managed.ticket,
        entry: semiAdoption.managed.entry,
        volume: semiAdoption.managed.initialVolume,
        ownershipId: semiAdoption.adoption?.ownershipId ?? null,
      });
      await managePosition(semiAdoption.position, quote, spec, m15);
      return;
    }

    journal("UNMANAGED_POSITION_PRESENT", {
      positions: positions.map((p) => ({ ticket: p.ticket, side: p.side, volume: p.volume })),
      semiAdoptionStatus: semiAdoption?.status ?? "UNKNOWN",
      semiAdoptionReason: semiAdoption?.reason ?? "UNKNOWN",
    });
    return;
  }
`;

const MANAGED_CLEAR = `      state.managed = null;
      saveState();`;

const SEMI_MANAGED_CLEAR = `      if (state.managed?.pattern === "SEMI_MANUAL") {
        await markPhase7CSemiManualAdoptionClosed(state.managed.ticket);
      }
      state.managed = null;
      saveState();`;

function countOccurrences(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

export function transformPhase7CSemiTrendRuntimeSource(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("SEMI Trend runtime source adapter requires non-empty TypeScript source.");
  }

  const alreadyWired =
    source.includes("reconcilePhase7CSemiManualPosition") &&
    source.includes("SEMI_MANUAL_POSITION_ADOPTED") &&
    source.includes("markPhase7CSemiManualAdoptionClosed");
  if (alreadyWired) return source;

  const unmanagedCount = countOccurrences(source, LEGACY_UNMANAGED_BLOCK);
  if (unmanagedCount !== 1) {
    throw new Error(
      `SEMI Trend runtime source adapter expected exactly one legacy unmanaged-position block; found ${unmanagedCount}.`,
    );
  }

  const clearCount = countOccurrences(source, MANAGED_CLEAR);
  if (clearCount < 1) {
    throw new Error(
      "SEMI Trend runtime source adapter could not locate the managed-position close path.",
    );
  }

  let output = RUNTIME_IMPORT + source;
  output = output.replace(LEGACY_UNMANAGED_BLOCK, SEMI_UNMANAGED_BLOCK);
  output = output.replaceAll(MANAGED_CLEAR, SEMI_MANAGED_CLEAR);

  if (
    !output.includes("await managePosition(semiAdoption.position, quote, spec, m15);") ||
    output.includes("await managePosition(positions[0], quote, spec, m15);") ||
    !output.includes("markPhase7CSemiManualAdoptionClosed")
  ) {
    throw new Error("SEMI Trend runtime source adapter postcondition failed.");
  }

  return output;
}
