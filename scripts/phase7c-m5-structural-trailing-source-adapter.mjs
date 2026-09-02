function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Phase7C M5 structural trailing adapter could not find ${label}.`);
  }
  return source.replace(search, replacement);
}

function prependImport(source) {
  const importLine = 'import { evaluateM5StructuralTrail } from "./phase7c-m5-structural-trailing.mjs";\n';
  return source.includes(importLine.trim()) ? source : importLine + source;
}

export function transformPhase7CTrendM5TrailingSource(input) {
  let source = prependImport(String(input));

  source = replaceRequired(
    source,
    'console.log("PHASE7B_DEMO_RUNNER_SL=M15_CONFIRMED_STRUCTURE_TRAILING");',
    'console.log("PHASE7B_DEMO_RUNNER_SL=M5_CONFIRMED_STRUCTURE_TRAILING");',
    "Trend runner trailing declaration",
  );
  source = replaceRequired(
    source,
    'console.log("PHASE7B_DEMO_POST_PLUS10_SL=M15_CONFIRMED_SWING_STRUCTURE_PLUS_1_BUFFER_ONLY_TIGHTEN");',
    'console.log("PHASE7B_DEMO_POST_PLUS10_SL=M5_CONFIRMED_SWING_STRUCTURE_PLUS_1_BUFFER_ONLY_TIGHTEN");',
    "Trend post +10 trailing declaration",
  );

  source = replaceRequired(
    source,
    "    await managePosition(managedPosition, quote, spec, m15);",
    "    await managePosition(managedPosition, quote, spec, m15, m5);",
    "Trend managed-position M5 handoff",
  );
  source = replaceRequired(
    source,
    "    await managePosition(\n      candidate,\n      quote,\n      spec,\n      m15,\n    );",
    "    await managePosition(\n      candidate,\n      quote,\n      spec,\n      m15,\n      m5,\n    );",
    "Trend recovered-position M5 handoff",
  );
  source = replaceRequired(
    source,
    "async function managePosition(position: Position, quote: Quote, spec: SymbolSpec, m15: Phase7Bar[]): Promise<void> {",
    "async function managePosition(position: Position, quote: Quote, spec: SymbolSpec, m15: Phase7Bar[], m5: Phase7Bar[]): Promise<void> {",
    "Trend management signature",
  );
  source = replaceRequired(
    source,
    "  const latestM15 = m15.at(-1);\n  const holdM15CloseTime = Number(latestM15?.closeTime ?? 0);",
    "  const latestM15 = m15.at(-1);\n  const latestM5 = m5.at(-1);\n  const holdM15CloseTime = Number(latestM15?.closeTime ?? 0);",
    "Trend latest M5 snapshot",
  );

  const oldTrailing = `    const structure = latestConfirmedStructureStop(managed.side, m15, managed.signalTimestamp, latest.closeTime);
    if (structure !== null) {
      const candidate = roundPrice(
        structuralStopWithBuffer(managed.side, structure),
        spec.digits,
      );
      const structuralBaseline = tightestKnownStop(
        managed.side,
        Number(position.stopLoss),
        Number(managed.lastStructuralStop),
      );
      if (stopStrictlyTightens(managed.side, structuralBaseline, candidate)) {
        const minimumGap = Math.max(spec.stopsLevelTicks, spec.freezeLevelTicks) * spec.point;
        const validAgainstMarket = managed.side === "BUY"
          ? candidate < quote.bid - minimumGap
          : candidate > quote.ask + minimumGap;
        if (validAgainstMarket) {
          managed.structureAttempt += 1;
          saveState();
          const commandId = \`p7b-struct-\${managed.ticket}-\${latest.closeTime}-\${managed.structureAttempt}\`;
          const response = await patch<CommandResponse>(\`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {
            stopLoss: candidate,
            commandId,
          });
          if (response.success) {
            managed.lastStructuralStop = candidate;
            saveState();
            journal("STRUCTURAL_SL_TIGHTEN", { ticket: managed.ticket, stopLoss: candidate, m15CloseTime: latest.closeTime, response });
          } else {
            journal("STRUCTURAL_SL_REJECTED", { ticket: managed.ticket, stopLoss: candidate, response });
          }
        }
      }
    }
`;

  const newTrailing = `    const m5Trail = latestM5
      ? evaluateM5StructuralTrail({
          side: managed.side,
          bars: m5,
          afterTimestamp: managed.partialActivatedAt ?? managed.signalTimestamp,
          atOrBefore: latestM5.closeTime,
          currentStop: Number(position.stopLoss),
          lastStructuralStop: Number(managed.lastStructuralStop),
          bid: quote.bid,
          ask: quote.ask,
          digits: spec.digits,
          point: spec.point,
          stopsLevelTicks: spec.stopsLevelTicks,
          freezeLevelTicks: spec.freezeLevelTicks,
        })
      : { allowed: false, reason: "M5_DATA_MISSING" };

    if (m5Trail.allowed) {
      managed.structureAttempt += 1;
      saveState();
      const commandId = \`p7b-m5-struct-\${managed.ticket}-\${m5Trail.confirmedAt}-\${managed.structureAttempt}\`;
      const response = await patch<CommandResponse>(\`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {
        stopLoss: m5Trail.stopLoss,
        commandId,
      });
      if (response.success) {
        managed.lastStructuralStop = m5Trail.stopLoss;
        saveState();
        journal("M5_STRUCTURAL_SL_TIGHTEN", {
          ticket: managed.ticket,
          stopLoss: m5Trail.stopLoss,
          structurePrice: m5Trail.structurePrice,
          pivotM5CloseTime: m5Trail.pivotCloseTime,
          m5CloseTime: m5Trail.confirmedAt,
          response,
        });
      } else {
        journal("M5_STRUCTURAL_SL_REJECTED", { ticket: managed.ticket, stopLoss: m5Trail.stopLoss, response });
      }
    }
`;
  source = replaceRequired(source, oldTrailing, newTrailing, "Trend M15 structural trailing block");

  return source;
}

export function transformPhase7CSidewayM5TrailingSource(input) {
  let source = prependImport(String(input));

  source = replaceRequired(
    source,
    'console.log("PHASE7C_SIDEWAY_MANAGEMENT=PLUS6_BREAK_EVEN_PLUS10_ONE_THIRD_NO_TRAILING");',
    'console.log("PHASE7C_SIDEWAY_MANAGEMENT=PLUS6_BREAK_EVEN_PLUS10_ONE_THIRD_M5_CONFIRMED_STRUCTURE_TRAILING");',
    "Sideway management declaration",
  );

  source = replaceRequired(
    source,
    "    partialApplied: false,\n    breakEvenApplied: false,",
    "    partialApplied: false,\n    partialActivatedAt: null,\n    breakEvenApplied: false,\n    lastStructuralStop: Number(opened.stopLoss || pending.stopLoss),\n    structureAttempt: 0,",
    "Sideway managed trailing state",
  );

  source = replaceRequired(
    source,
    "      managed.breakEvenApplied = true;\n      saveState();\n      journal(\"PLUS6_SL_ALREADY_AT_OR_TIGHTER\"",
    "      managed.breakEvenApplied = true;\n      managed.lastStructuralStop = Number(position.stopLoss);\n      saveState();\n      journal(\"PLUS6_SL_ALREADY_AT_OR_TIGHTER\"",
    "Sideway already-tight BE state",
  );
  source = replaceRequired(
    source,
    "          managed.breakEvenApplied = true;\n          saveState();\n          journal(\"PLUS6_SL_TO_ENTRY\"",
    "          managed.breakEvenApplied = true;\n          managed.lastStructuralStop = beStop;\n          saveState();\n          journal(\"PLUS6_SL_TO_ENTRY\"",
    "Sideway BE success state",
  );
  source = replaceRequired(
    source,
    "        managed.partialApplied = true;\n        managed.expectedRemainingVolume = normalizeVolume(Number(position.volume) - closeVolume, Number(spec.volumeStep));",
    "        managed.partialApplied = true;\n        managed.partialActivatedAt = Number(quote.timestamp);\n        managed.expectedRemainingVolume = normalizeVolume(Number(position.volume) - closeVolume, Number(spec.volumeStep));",
    "Sideway partial activation timestamp",
  );

  const trailingInsertion = `
  if (managed.partialApplied) {
    try {
      const m5 = await bridgeGet(\`/v1/candles/\${encodeURIComponent(symbol)}?timeframe=M5&count=\${m5CandleCount}\`);
      const latestM5 = Array.isArray(m5) ? m5.at(-1) : null;
      const m5CloseTime = Number(latestM5?.closeTime ?? 0);
      const m5Freshness = evaluateTimestampFreshness(m5CloseTime, {
        maxAgeMs: maxM5AgeMs,
        clockOffsetMs: brokerClockOffsetMs,
      });

      if (!latestM5 || !m5Freshness.fresh) {
        journal("SIDEWAY_M5_STRUCTURAL_SL_SKIP", {
          ticket: managed.ticket,
          reason: latestM5 ? m5Freshness.reason : "M5_DATA_MISSING",
          m5CloseTime: m5CloseTime || null,
        });
      } else {
        const m5Trail = evaluateM5StructuralTrail({
          side: managed.side,
          bars: m5,
          afterTimestamp: Number(managed.partialActivatedAt ?? managed.signalM5CloseTime ?? 0),
          atOrBefore: m5CloseTime,
          currentStop: Number(position.stopLoss),
          lastStructuralStop: Number(managed.lastStructuralStop ?? 0),
          bid: quote.bid,
          ask: quote.ask,
          digits: Number(spec.digits ?? 2),
          point: Number(spec.point),
          stopsLevelTicks: Number(spec.stopsLevelTicks ?? 0),
          freezeLevelTicks: Number(spec.freezeLevelTicks ?? 0),
        });

        if (m5Trail.allowed) {
          managed.structureAttempt = Number(managed.structureAttempt ?? 0) + 1;
          saveState();
          const response = await bridgeRequest("PATCH", \`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {
            stopLoss: m5Trail.stopLoss,
            commandId: \`p7c-sideway-m5-struct-\${managed.ticket}-\${m5Trail.confirmedAt}-\${managed.structureAttempt}\`,
          });
          if (response.success) {
            managed.lastStructuralStop = m5Trail.stopLoss;
            saveState();
            journal("SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN", {
              ticket: managed.ticket,
              stopLoss: m5Trail.stopLoss,
              structurePrice: m5Trail.structurePrice,
              pivotM5CloseTime: m5Trail.pivotCloseTime,
              m5CloseTime: m5Trail.confirmedAt,
              response,
            });
          } else {
            journal("SIDEWAY_M5_STRUCTURAL_SL_REJECTED", {
              ticket: managed.ticket,
              stopLoss: m5Trail.stopLoss,
              response,
            });
          }
        }
      }
    } catch (error) {
      journal("SIDEWAY_M5_STRUCTURAL_SL_SKIP", {
        ticket: managed.ticket,
        reason: "M5_TRAILING_DATA_OR_BROKER_ERROR",
        message: errorMessage(error),
      });
    }
  }
`;

  source = replaceRequired(
    source,
    "\n  if (await closeFixedTpIfTriggered(position, quote)) return;\n\n  // TP2 is already broker-protected on the position.",
    `${trailingInsertion}\n  if (await closeFixedTpIfTriggered(position, quote)) return;\n\n  // TP2 is already broker-protected on the position.`,
    "Sideway post-partial trailing insertion point",
  );

  return source;
}
