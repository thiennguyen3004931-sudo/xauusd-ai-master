const trailingImport = `import { planM5StructuralTrailingStop } from "./phase7c-m5-structural-trailing-stop.mjs";\n`;

function normalize(source) {
  return String(source).replace(/\r\n?/g, "\n");
}

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) {
    throw new Error(`Phase7C ${label} M5 structural trailing marker no longer matches; refusing execution.`);
  }
  if (source.indexOf(needle, index + needle.length) >= 0) {
    throw new Error(`Phase7C ${label} M5 structural trailing marker is ambiguous; refusing execution.`);
  }
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Phase7C ${label} M5 structural trailing start marker no longer matches; refusing execution.`);
  }
  const end = source.indexOf(endMarker, start);
  if (end < 0) {
    throw new Error(`Phase7C ${label} M5 structural trailing end marker no longer matches; refusing execution.`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

export function transformPhase7CTrendM5StructuralTrailingSource(rawSource) {
  let source = normalize(rawSource);

  source = replaceOnce(
    source,
    'console.log("PHASE7B_DEMO_RUNNER_SL=M15_CONFIRMED_STRUCTURE_TRAILING");',
    'console.log("PHASE7B_DEMO_RUNNER_SL=M5_CONFIRMED_HIGHER_LOW_LOWER_HIGH_TRAILING");',
    "Trend runner log",
  );
  source = replaceOnce(
    source,
    'console.log("PHASE7B_DEMO_POST_PLUS10_SL=M15_CONFIRMED_SWING_STRUCTURE_PLUS_1_BUFFER_ONLY_TIGHTEN");',
    'console.log("PHASE7B_DEMO_POST_PLUS10_SL=M5_CONFIRMED_HIGHER_LOW_LOWER_HIGH_PLUS_1_BUFFER_ONLY_TIGHTEN");',
    "Trend post-plus10 log",
  );
  source = replaceOnce(
    source,
    "    await managePosition(managedPosition, quote, spec, m15);",
    "    await managePosition(managedPosition, quote, spec, m15, m5);",
    "Trend managed call",
  );
  source = replaceOnce(
    source,
    "    await managePosition(\n      candidate,\n      quote,\n      spec,\n      m15,\n    );",
    "    await managePosition(\n      candidate,\n      quote,\n      spec,\n      m15,\n      m5,\n    );",
    "Trend recovered managed call",
  );
  source = replaceOnce(
    source,
    "async function managePosition(position: Position, quote: Quote, spec: SymbolSpec, m15: Phase7Bar[]): Promise<void> {",
    "async function managePosition(position: Position, quote: Quote, spec: SymbolSpec, m15: Phase7Bar[], m5: Phase7Bar[]): Promise<void> {",
    "Trend manager signature",
  );

  source = replaceSection(
    source,
    "  if (managed.partialApplied) {\n    const structure = latestConfirmedStructureStop(",
    "\n    if (\n      managed.partialActivatedAt !== null &&",
    `  if (managed.partialApplied) {\n    if (!(Number(managed.partialActivatedAt) > 0) && Number(quote.timestamp) > 0) {\n      managed.partialActivatedAt = Number(quote.timestamp);\n      saveState();\n      journal("M5_TRAILING_ACTIVATED_AFTER_PARTIAL_RECOVERY", {\n        ticket: managed.ticket,\n        activatedAt: managed.partialActivatedAt,\n      });\n    }\n\n    const trailing = planM5StructuralTrailingStop({\n      active: true,\n      side: managed.side,\n      bars: m5,\n      afterTimestamp: Number(managed.partialActivatedAt ?? 0),\n      atOrBefore: Number(quote.timestamp),\n      currentStop: Number(position.stopLoss),\n      lastStructuralStop: Number(managed.lastStructuralStop),\n      bid: Number(quote.bid),\n      ask: Number(quote.ask),\n      point: Number(spec.point),\n      stopsLevelTicks: Number(spec.stopsLevelTicks ?? 0),\n      freezeLevelTicks: Number(spec.freezeLevelTicks ?? 0),\n      digits: Number(spec.digits),\n    });\n\n    if (trailing.action === "TIGHTEN") {\n      managed.structureAttempt += 1;\n      saveState();\n      const commandId = \`p7b-m5-struct-\${managed.ticket}-\${trailing.structure.confirmationCloseTime}-\${managed.structureAttempt}\`;\n      const response = await patch<CommandResponse>(\`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {\n        stopLoss: trailing.stopLoss,\n        commandId,\n      });\n      if (response.success) {\n        managed.lastStructuralStop = trailing.stopLoss;\n        saveState();\n        journal("M5_STRUCTURAL_SL_TIGHTEN", {\n          ticket: managed.ticket,\n          stopLoss: trailing.stopLoss,\n          structure: trailing.structure,\n          commandId,\n          response,\n        });\n      } else {\n        journal("M5_STRUCTURAL_SL_REJECTED", {\n          ticket: managed.ticket,\n          stopLoss: trailing.stopLoss,\n          structure: trailing.structure,\n          commandId,\n          response,\n        });\n      }\n    }\n`,
    "Trend trailing block",
  );

  return trailingImport + source;
}

export function transformPhase7CSidewayM5StructuralTrailingSource(rawSource) {
  let source = normalize(rawSource);

  source = replaceOnce(
    source,
    'console.log("PHASE7C_SIDEWAY_MANAGEMENT=PLUS6_BREAK_EVEN_PLUS10_ONE_THIRD_NO_TRAILING");',
    'console.log("PHASE7C_SIDEWAY_MANAGEMENT=PLUS6_BREAK_EVEN_PLUS10_ONE_THIRD_M5_CONFIRMED_HIGHER_LOW_LOWER_HIGH_PLUS_1_BUFFER_ONLY_TIGHTEN");',
    "Sideway management log",
  );
  source = replaceOnce(
    source,
    "    partialApplied: false,\n    breakEvenApplied: false,",
    "    partialApplied: false,\n    partialActivatedAt: null,\n    breakEvenApplied: false,\n    lastStructuralStop: Number(opened.stopLoss) || Number(pending.stopLoss),\n    structureAttempt: 0,",
    "Sideway managed state",
  );
  source = replaceOnce(
    source,
    "        managed.partialApplied = true;\n        managed.expectedRemainingVolume = normalizeVolume(Number(position.volume) - closeVolume, Number(spec.volumeStep));",
    "        managed.partialApplied = true;\n        managed.partialActivatedAt = Number(quote.timestamp);\n        managed.expectedRemainingVolume = normalizeVolume(Number(position.volume) - closeVolume, Number(spec.volumeStep));",
    "Sideway partial activation",
  );

  source = replaceSection(
    source,
    "function normalizeManagedState(raw) {",
    "\nfunction loadState() {",
    `function normalizeManagedState(raw) {\n  if (!raw || typeof raw !== "object") return null;\n  const distance = Number(raw.fixedTpDistance);\n  const price = Number(raw.fixedTpPrice);\n  const fixedTpEnabled =\n    raw.fixedTpEnabled === true &&\n    Number.isFinite(distance) &&\n    distance > 0 &&\n    Number.isFinite(price);\n  const partialActivatedAt = Number(raw.partialActivatedAt);\n  const persistedStructuralStop = Number(raw.lastStructuralStop);\n  const fallbackStructuralStop = Number(raw.stopLoss);\n  const structureAttempt = Number(raw.structureAttempt);\n  return {\n    ...raw,\n    fixedTpEnabled: fixedTpEnabled ? true : false,\n    fixedTpDistance: fixedTpEnabled ? distance : 0,\n    fixedTpPrice: fixedTpEnabled ? price : null,\n    partialActivatedAt: Number.isFinite(partialActivatedAt) && partialActivatedAt > 0\n      ? partialActivatedAt\n      : null,\n    lastStructuralStop: Number.isFinite(persistedStructuralStop) && persistedStructuralStop > 0\n      ? persistedStructuralStop\n      : Number.isFinite(fallbackStructuralStop) && fallbackStructuralStop > 0\n        ? fallbackStructuralStop\n        : 0,\n    structureAttempt: Number.isSafeInteger(structureAttempt) && structureAttempt >= 0\n      ? structureAttempt\n      : 0,\n  };\n}\n`,
    "Sideway state normalization",
  );

  source = replaceOnce(
    source,
    "  if (await closeFixedTpIfTriggered(position, quote)) return;\n\n  // TP2 is already broker-protected on the position.",
    `  if (await closeFixedTpIfTriggered(position, quote)) return;\n\n  if (managed.partialApplied) {\n    if (!(Number(managed.partialActivatedAt) > 0) && Number(quote.timestamp) > 0) {\n      managed.partialActivatedAt = Number(quote.timestamp);\n      saveState();\n      journal("M5_TRAILING_ACTIVATED_AFTER_PARTIAL_RECOVERY", {\n        ticket: managed.ticket,\n        activatedAt: managed.partialActivatedAt,\n      });\n    }\n\n    let m5 = null;\n    try {\n      m5 = await bridgeGet(\`/v1/candles/\${encodeURIComponent(symbol)}?timeframe=M5&count=\${m5CandleCount}\`);\n    } catch (error) {\n      journal("M5_STRUCTURAL_TRAILING_DATA_ERROR", {\n        ticket: managed.ticket,\n        message: errorMessage(error),\n      });\n    }\n\n    if (Array.isArray(m5)) {\n      const trailing = planM5StructuralTrailingStop({\n        active: true,\n        side: managed.side,\n        bars: m5,\n        afterTimestamp: Number(managed.partialActivatedAt ?? 0),\n        atOrBefore: Number(quote.timestamp),\n        currentStop: Number(position.stopLoss),\n        lastStructuralStop: Number(managed.lastStructuralStop),\n        bid: Number(quote.bid),\n        ask: Number(quote.ask),\n        point: Number(spec.point),\n        stopsLevelTicks: Number(spec.stopsLevelTicks ?? 0),\n        freezeLevelTicks: Number(spec.freezeLevelTicks ?? 0),\n        digits: Number(spec.digits ?? 2),\n      });\n\n      if (trailing.action === "TIGHTEN") {\n        managed.structureAttempt += 1;\n        saveState();\n        const commandId = \`p7c-sideway-m5-struct-\${managed.ticket}-\${trailing.structure.confirmationCloseTime}-\${managed.structureAttempt}\`;\n        const response = await bridgeRequest("PATCH", \`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {\n          stopLoss: trailing.stopLoss,\n          commandId,\n        });\n        if (response.success) {\n          managed.lastStructuralStop = trailing.stopLoss;\n          saveState();\n          journal("M5_STRUCTURAL_SL_TIGHTEN", {\n            ticket: managed.ticket,\n            stopLoss: trailing.stopLoss,\n            structure: trailing.structure,\n            commandId,\n          });\n        } else {\n          journal("M5_STRUCTURAL_SL_REJECTED", {\n            ticket: managed.ticket,\n            stopLoss: trailing.stopLoss,\n            structure: trailing.structure,\n            commandId,\n            response,\n          });\n        }\n      }\n    }\n  }\n\n  // TP2 is already broker-protected on the position.`,
    "Sideway trailing integration",
  );

  return trailingImport + source;
}
