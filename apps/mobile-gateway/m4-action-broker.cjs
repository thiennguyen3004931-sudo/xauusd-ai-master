"use strict";

const { parseActionBody } = require("./m4-contract.cjs");

function normalizeIdentity(value) {
  return String(value ?? "").trim().toLowerCase();
}

function boundedMessage(error) {
  return String(error instanceof Error ? error.message : error ?? "UNKNOWN_ERROR").slice(0, 500);
}

function failureResult(action, error) {
  const httpStatus = Number(error?.status) || 502;
  return {
    action,
    outcome: httpStatus >= 400 && httpStatus < 500 ? "FAIL" : "AMBIGUOUS",
    httpStatus,
    message: boundedMessage(error),
  };
}

function sanitizePreflight(preflight) {
  const {
    preflightToken: _secret,
    ...safe
  } = preflight || {};
  return safe;
}

function createM4ActionBroker({ canonical, transactions, audit, now = Date.now } = {}) {
  if (!canonical) throw new Error("CANONICAL_CLIENT_REQUIRED");
  if (!transactions) throw new Error("TRANSACTION_STORE_REQUIRED");

  async function auditBefore(event) {
    if (audit?.before) await audit.before(event);
  }

  async function auditAfter(event) {
    if (audit?.after) await audit.after(event);
  }

  async function handleMode(identity, parsed) {
    const event = { identity: normalizeIdentity(identity), action: parsed.action, at: now() };
    await auditBefore(event);
    try {
      const result = await canonical.executeModeAction(parsed.action);
      const response = { action: parsed.action, outcome: "PASS", result };
      await auditAfter({ ...event, outcome: "PASS" });
      return response;
    } catch (error) {
      const response = failureResult(parsed.action, error);
      await auditAfter({ ...event, outcome: response.outcome, httpStatus: response.httpStatus });
      return response;
    }
  }

  async function handlePreflight(identity, parsed) {
    const normalized = normalizeIdentity(identity);
    await canonical.getArmCapability();
    const preflight = await canonical.createArmPreflight(parsed.action);
    const safe = sanitizePreflight(preflight);

    if (!preflight?.approved || !preflight?.preflightToken) {
      return {
        action: parsed.action,
        phase: "PREFLIGHT",
        approved: false,
        ...safe,
      };
    }

    const transactionId = transactions.create({
      identity: normalized,
      action: parsed.action,
      canonicalToken: preflight.preflightToken,
      expiresAt: preflight.expiresAt,
      preflight: safe,
    });

    return {
      action: parsed.action,
      phase: "PREFLIGHT",
      approved: true,
      transactionId,
      ...safe,
    };
  }

  async function handleExecute(identity, parsed) {
    const record = transactions.getForExecute(identity, parsed.action, parsed.transactionId);
    const token = record.canonicalToken;
    transactions.markExecuting(parsed.transactionId);

    try {
      const accepted = await canonical.executeArm(parsed.action, token);
      if (!accepted?.requestId) {
        return {
          action: parsed.action,
          transactionId: parsed.transactionId,
          outcome: "AMBIGUOUS",
          message: "CANONICAL_REQUEST_ID_MISSING",
        };
      }
      transactions.setRequestId(parsed.transactionId, accepted.requestId);
      return {
        action: parsed.action,
        transactionId: parsed.transactionId,
        requestId: accepted.requestId,
        outcome: "RUNNING",
        message: String(accepted.message ?? "accepted"),
      };
    } catch (error) {
      return {
        transactionId: parsed.transactionId,
        ...failureResult(parsed.action, error),
      };
    }
  }

  async function handleAction(identity, body) {
    const parsed = parseActionBody(body);
    if (parsed.action.startsWith("MODE_")) return handleMode(identity, parsed);
    if (parsed.phase === "PREFLIGHT") return handlePreflight(identity, parsed);
    return handleExecute(identity, parsed);
  }

  async function getTransactionStatus(identity, transactionId) {
    const record = transactions.readStatus(identity, transactionId);
    if (!record.requestId) {
      return {
        transactionId: record.transactionId,
        action: record.action,
        status: record.consumed ? "AMBIGUOUS" : "PREFLIGHT_READY",
        finalArmStatus: null,
      };
    }

    const canonicalStatus = await canonical.getArmStatus(record.requestId);
    const expectedFinal = record.action === "ARM_LIVE" ? "ARMED" : "DISARMED";
    let status = canonicalStatus?.status ?? "AMBIGUOUS";
    if (status === "PASS" && String(canonicalStatus?.finalArmStatus ?? "").toUpperCase() !== expectedFinal) {
      status = "AMBIGUOUS";
    }

    const safe = {
      transactionId: record.transactionId,
      action: record.action,
      requestId: record.requestId,
      status,
      phase: canonicalStatus?.phase ?? "UNKNOWN",
      message: String(canonicalStatus?.message ?? ""),
      finalArmStatus: canonicalStatus?.finalArmStatus ?? null,
    };
    transactions.updateCanonicalStatus(transactionId, safe);
    return safe;
  }

  return Object.freeze({ handleAction, getTransactionStatus });
}

module.exports = { createM4ActionBroker };
