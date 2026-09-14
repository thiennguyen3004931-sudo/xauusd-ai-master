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

const LEGACY_PENDING_FVG_TYPE_TAIL = `  recoveryDayStartTime: number;
};`;
const PHASE7C_PENDING_FVG_TYPE_TAIL = `  recoveryDayStartTime: number;
  fvgConfirmedAtEntry?: boolean;
};`;

const LEGACY_PENDING_FVG_VALUE_TAIL = `    brokerReferenceTimestamp,
    dailyMode: dailyRecovery.mode,
    dailyNetPnlAtEntry: dailyRecovery.dailyNetPnl,
    recoveryTargetNetPnl: dailyRecovery.targetNetPnl,
    recoveryTpDistance: dailyRecovery.tpDistance,
    recoveryTakeProfit: takeProfit,
    recoveryDayStartTime: dailyRecovery.dayStartTime,
  };`;
const PHASE7C_PENDING_FVG_VALUE_TAIL = `    brokerReferenceTimestamp,
    dailyMode: dailyRecovery.mode,
    dailyNetPnlAtEntry: dailyRecovery.dailyNetPnl,
    recoveryTargetNetPnl: dailyRecovery.targetNetPnl,
    recoveryTpDistance: dailyRecovery.tpDistance,
    recoveryTakeProfit: takeProfit,
    recoveryDayStartTime: dailyRecovery.dayStartTime,
    fvgConfirmedAtEntry,
  };`;

const LEGACY_PENDING_EXPIRED_BLOCK = `        journal("PENDING_ENTRY_EXPIRED_NO_POSITION", {
          orderId: pending.orderId,
          brokerTicket: pending.brokerTicket,
          ageMs: pendingAgeMs,
        });`;
const PHASE7C_PENDING_EXPIRED_BLOCK = `        journal("PENDING_ENTRY_EXPIRED_NO_POSITION", {
          orderId: pending.orderId,
          brokerTicket: pending.brokerTicket,
          ageMs: pendingAgeMs,
        });
        journal("ENTRY_ACCEPTED_POSITION_NOT_RESOLVED", {
          message: "Position không resolve sau 60 giây",
          orderId: pending.orderId,
          ticket: pending.brokerTicket,
          ageMs: pendingAgeMs,
        });`;

const LEGACY_PENDING_RECOVERED_BLOCK = `    journal("PENDING_ENTRY_RECOVERED", {
      orderId: pending.orderId,
      brokerTicket: pending.brokerTicket,
      ticket: candidate.ticket,
      side: pending.side,
      volume: candidate.volume,
    });`;
const PHASE7C_PENDING_RECOVERED_BLOCK = `    journal("PENDING_ENTRY_RECOVERED", {
      orderId: pending.orderId,
      brokerTicket: pending.brokerTicket,
      ticket: candidate.ticket,
      side: pending.side,
      volume: candidate.volume,
    });
    journal("ENTRY_FILLED", {
      entryState: pending.entryState,
      stopLoss: candidate.stopLoss || pending.stopLoss,
      position: candidate,
      fillPrice: candidate.entry,
      fvgConfirmedAtEntry: pending.fvgConfirmedAtEntry ?? false,
      dailyMode: pending.dailyMode,
      dailyNetPnlAtEntry: pending.dailyNetPnlAtEntry,
      recoveryTargetNetPnl: pending.recoveryTargetNetPnl,
      recoveryTpDistance: pending.recoveryTpDistance,
      recoveryTakeProfit: pending.recoveryTakeProfit,
      recoveredFromPending: true,
    });`;

const LEGACY_TRANSIENT_UNRESOLVED_EVENT = `journal("ENTRY_ACCEPTED_POSITION_NOT_RESOLVED", {`;
const PHASE7C_TRANSIENT_PENDING_EVENT = `journal("ENTRY_ACCEPTED_POSITION_PENDING_RESOLUTION", {`;

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

function replaceExactlyOnce(source, needle, replacement, label) {
  const count = countOccurrences(source, needle);
  if (count !== 1) {
    throw new Error(
      `SEMI Trend runtime source adapter expected exactly one ${label}; found ${count}.`,
    );
  }
  return source.replace(needle, replacement);
}

function transformEntryResolutionLifecycle(source) {
  const alreadyWired =
    source.includes("ENTRY_ACCEPTED_POSITION_PENDING_RESOLUTION") &&
    source.includes("Position không resolve sau 60 giây") &&
    source.includes("recoveredFromPending: true");
  if (alreadyWired) return source;

  let output = source;
  output = replaceExactlyOnce(
    output,
    LEGACY_PENDING_FVG_TYPE_TAIL,
    PHASE7C_PENDING_FVG_TYPE_TAIL,
    "pending-entry FVG type tail",
  );
  output = replaceExactlyOnce(
    output,
    LEGACY_PENDING_FVG_VALUE_TAIL,
    PHASE7C_PENDING_FVG_VALUE_TAIL,
    "pending-entry FVG value tail",
  );
  output = replaceExactlyOnce(
    output,
    LEGACY_PENDING_EXPIRED_BLOCK,
    PHASE7C_PENDING_EXPIRED_BLOCK,
    "pending-entry expiry block",
  );
  output = replaceExactlyOnce(
    output,
    LEGACY_PENDING_RECOVERED_BLOCK,
    PHASE7C_PENDING_RECOVERED_BLOCK,
    "pending-entry recovery block",
  );

  // After the timeout warning has been injected there are two legacy unresolved
  // markers: the original transient marker first and the genuine timeout marker
  // second. Rename only the first one so Telegram stays quiet while MT5 position
  // visibility is still settling; the timeout retains the existing warning card.
  const transientIndex = output.indexOf(LEGACY_TRANSIENT_UNRESOLVED_EVENT);
  if (transientIndex < 0) {
    throw new Error(
      "SEMI Trend runtime source adapter could not locate transient unresolved entry marker.",
    );
  }
  output =
    output.slice(0, transientIndex) +
    PHASE7C_TRANSIENT_PENDING_EVENT +
    output.slice(transientIndex + LEGACY_TRANSIENT_UNRESOLVED_EVENT.length);

  if (
    countOccurrences(output, PHASE7C_TRANSIENT_PENDING_EVENT) !== 1 ||
    countOccurrences(output, LEGACY_TRANSIENT_UNRESOLVED_EVENT) !== 1 ||
    !output.includes("journal(\"ENTRY_FILLED\", {") ||
    !output.includes("recoveredFromPending: true") ||
    !output.includes("fvgConfirmedAtEntry: pending.fvgConfirmedAtEntry ?? false")
  ) {
    throw new Error("SEMI Trend runtime source adapter entry-resolution postcondition failed.");
  }

  return output;
}

export function transformPhase7CSemiTrendRuntimeSource(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("SEMI Trend runtime source adapter requires non-empty TypeScript source.");
  }

  let output = source;
  const semiAlreadyWired =
    output.includes("reconcilePhase7CSemiManualPosition") &&
    output.includes("SEMI_MANUAL_POSITION_ADOPTED") &&
    output.includes("markPhase7CSemiManualAdoptionClosed");

  if (!semiAlreadyWired) {
    const unmanagedCount = countOccurrences(output, LEGACY_UNMANAGED_BLOCK);
    if (unmanagedCount !== 1) {
      throw new Error(
        `SEMI Trend runtime source adapter expected exactly one legacy unmanaged-position block; found ${unmanagedCount}.`,
      );
    }

    const clearCount = countOccurrences(output, MANAGED_CLEAR);
    if (clearCount < 1) {
      throw new Error(
        "SEMI Trend runtime source adapter could not locate the managed-position close path.",
      );
    }

    output = RUNTIME_IMPORT + output;
    output = output.replace(LEGACY_UNMANAGED_BLOCK, SEMI_UNMANAGED_BLOCK);
    output = output.replaceAll(MANAGED_CLEAR, SEMI_MANAGED_CLEAR);

    if (
      !output.includes("await managePosition(semiAdoption.position, quote, spec, m15);") ||
      output.includes("await managePosition(positions[0], quote, spec, m15);") ||
      !output.includes("markPhase7CSemiManualAdoptionClosed")
    ) {
      throw new Error("SEMI Trend runtime source adapter postcondition failed.");
    }
  }

  return transformEntryResolutionLifecycle(output);
}
