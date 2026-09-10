import assert from "node:assert/strict";
import { test } from "node:test";

import type { DurableSemiAdoptionState } from "./phase7c-semi-adoption-state.service";
import {
  createPhase7CSemiAdoptionCycle,
  type Phase7CSemiAdoptionRunnerDependencies,
} from "./phase7c-semi-adoption-runner.service";

const ACTIVATION = 1_789_020_000_000;
const OPENED = ACTIVATION + 2_000;
const NOW = ACTIVATION + 10_000;

function basePosition(overrides: Record<string, unknown> = {}) {
  return {
    ticket: "304779839",
    symbol: "XAUUSD",
    side: "SHORT" as const,
    volume: 0.12,
    entry: 4413.2,
    stopLoss: 4420,
    takeProfit: 0,
    openedAt: OPENED,
    ...overrides,
  };
}

function baseDeal(overrides: Record<string, unknown> = {}) {
  return {
    ticket: "88001",
    positionId: "304779839",
    symbol: "XAUUSD",
    side: "SELL" as const,
    entry: "IN" as const,
    magic: 0,
    comment: "",
    timestamp: OPENED,
    ...overrides,
  };
}

function adoption(overrides: Partial<DurableSemiAdoptionState> = {}): DurableSemiAdoptionState {
  return {
    version: 1,
    ownershipId: `semi:304779839:${ACTIVATION}`,
    ticket: "304779839",
    openingDealTicket: "88001",
    symbol: "XAUUSD",
    accountLogin: "5201362",
    entrySource: "MANUAL",
    managementStrategy: "TREND",
    side: "SHORT",
    entry: 4413.2,
    initialVolume: 0.12,
    expectedRemainingVolume: 0.12,
    activationEpochMs: ACTIVATION,
    manualOpenedAt: OPENED,
    managementStartedAt: NOW,
    initialStopDistance: 6,
    targetStopLoss: 4420,
    tightestStopLoss: 4420,
    protectionStatus: "PENDING",
    protectionReason: "PROTECTION_REQUIRED",
    fixedTakeProfit: { enabled: true, targetPrice: 4393.2 },
    updatedAt: NOW,
    ...overrides,
  };
}

function harness(overrides: Partial<Phase7CSemiAdoptionRunnerDependencies> = {}) {
  const saves: DurableSemiAdoptionState[] = [];
  const protectCalls: string[] = [];
  const lockReleases: string[] = [];
  let state: DurableSemiAdoptionState | null = null;
  let modeReads = 0;

  const deps: Phase7CSemiAdoptionRunnerDependencies = {
    now: () => NOW,
    readMode: () => {
      modeReads += 1;
      return {
        mode: "SEMI",
        updatedAt: new Date(ACTIVATION).toISOString(),
        updatedBy: "web-control-center",
      };
    },
    readRuntime: async () => ({
      lifecycleReady: true,
      accountStateValid: true,
      accountMode: "LIVE",
      brokerReachable: true,
      brokerAccountMode: "real",
      accountLogin: 5201362,
      tradingEnabled: true,
      terminalTradeAllowed: true,
      expertTradeAllowed: true,
      liveExecutionArmed: true,
      liveArmStatus: "ARMED",
      quote: { bid: 4412.9, ask: 4413.1 },
      spec: { tickSize: 0.1, stopsLevelTicks: 0, freezeLevelTicks: 0 },
      positions: [basePosition()],
    }),
    readDeals: async () => [baseDeal()],
    readTrendFixedTakeProfit: () => ({ enabled: true, distance: 20 }),
    systemMagicNumber: 270713,
    adoptionRepository: {
      findByTicket: async () => state,
      listActive: async () => state ? [structuredClone(state)] : [],
      save: async (next) => {
        state = structuredClone(next);
        saves.push(structuredClone(next));
      },
    },
    acquireExecutionLock: () => ({
      acquired: true as const,
      release: () => lockReleases.push("released"),
    }),
    protectTicket: async (ticket) => {
      protectCalls.push(ticket);
      if (state) {
        state = {
          ...state,
          protectionStatus: "PROTECTED",
          protectionReason: "BROKER_CONFIRMED",
          updatedAt: NOW + 1,
        };
      }
      return {
        status: "PROTECTED" as const,
        ticket,
        brokerMutationAttempted: true,
        reason: "BROKER_CONFIRMED",
        generatedAt: NOW + 1,
      };
    },
    ...overrides,
  };

  return {
    cycle: createPhase7CSemiAdoptionCycle(deps),
    saves,
    protectCalls,
    lockReleases,
    modeReads: () => modeReads,
    state: () => state,
  };
}

test("valid manual SELL opened after SEMI activation becomes durable and immediately protected with Trend Fixed TP", async () => {
  const h = harness();
  const result = await h.cycle();

  assert.equal(result.status, "PROTECTED");
  assert.equal(result.reason, "BROKER_CONFIRMED");
  assert.equal(h.saves.length, 1);
  assert.deepEqual(h.protectCalls, ["304779839"]);
  assert.equal(h.saves[0]?.ticket, "304779839");
  assert.equal(h.saves[0]?.entrySource, "MANUAL");
  assert.equal(h.saves[0]?.managementStrategy, "TREND");
  assert.equal(h.saves[0]?.activationEpochMs, ACTIVATION);
  assert.equal(h.saves[0]?.targetStopLoss, 4420, "existing tighter SELL stop must never be widened to 4419.2");
  assert.equal(h.saves[0]?.fixedTakeProfit.enabled, true);
  assert.equal(h.saves[0]?.fixedTakeProfit.targetPrice, 4393.2);
  assert.equal(h.saves[0]?.protectionStatus, "PENDING");
  assert.equal(h.lockReleases.length, 1);
  assert.ok(h.modeReads() >= 2, "SEMI mode must be re-read under the shared execution lock");
});

test("LIVE SEMI protection is fail-closed when current bridge session is not ARMED", async () => {
  const h = harness({
    readRuntime: async () => ({
      lifecycleReady: true,
      accountStateValid: true,
      accountMode: "LIVE",
      brokerReachable: true,
      brokerAccountMode: "real",
      accountLogin: 5201362,
      tradingEnabled: true,
      terminalTradeAllowed: true,
      expertTradeAllowed: true,
      liveExecutionArmed: false,
      liveArmStatus: "DISARMED",
      quote: { bid: 4412.9, ask: 4413.1 },
      spec: { tickSize: 0.1, stopsLevelTicks: 0, freezeLevelTicks: 0 },
      positions: [basePosition()],
    }),
  });

  const result = await h.cycle();
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "LIVE_ARM_REQUIRED");
  assert.equal(h.saves.length, 0);
  assert.equal(h.protectCalls.length, 0);
});

test("position that predates the SEMI activation epoch is never retro-adopted", async () => {
  const h = harness({
    readRuntime: async () => ({
      lifecycleReady: true,
      accountStateValid: true,
      accountMode: "LIVE",
      brokerReachable: true,
      brokerAccountMode: "real",
      accountLogin: 5201362,
      tradingEnabled: true,
      terminalTradeAllowed: true,
      expertTradeAllowed: true,
      liveExecutionArmed: true,
      liveArmStatus: "ARMED",
      quote: { bid: 4412.9, ask: 4413.1 },
      spec: { tickSize: 0.1, stopsLevelTicks: 0, freezeLevelTicks: 0 },
      positions: [basePosition({ openedAt: ACTIVATION })],
    }),
  });

  const result = await h.cycle();
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "POSITION_NOT_AFTER_ACTIVATION");
  assert.equal(h.saves.length, 0);
  assert.equal(h.protectCalls.length, 0);
});

test("ambiguous multiple XAUUSD positions fail closed without creating ownership", async () => {
  const h = harness({
    readRuntime: async () => ({
      lifecycleReady: true,
      accountStateValid: true,
      accountMode: "LIVE",
      brokerReachable: true,
      brokerAccountMode: "real",
      accountLogin: 5201362,
      tradingEnabled: true,
      terminalTradeAllowed: true,
      expertTradeAllowed: true,
      liveExecutionArmed: true,
      liveArmStatus: "ARMED",
      quote: { bid: 4412.9, ask: 4413.1 },
      spec: { tickSize: 0.1, stopsLevelTicks: 0, freezeLevelTicks: 0 },
      positions: [basePosition(), basePosition({ ticket: "OTHER" })],
    }),
  });

  const result = await h.cycle();
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "POSITION_COUNT_AMBIGUOUS");
  assert.equal(h.saves.length, 0);
  assert.equal(h.protectCalls.length, 0);
});

test("shared execution lock is mandatory before durable ownership or broker protection", async () => {
  const h = harness({
    acquireExecutionLock: () => ({
      acquired: false as const,
      reason: "LOCK_BUSY",
      release: () => undefined,
    }),
  });

  const result = await h.cycle();
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "EXECUTION_LOCK_BUSY");
  assert.equal(h.saves.length, 0);
  assert.equal(h.protectCalls.length, 0);
});

test("mode transition away from SEMI while waiting for the lock aborts before adoption", async () => {
  let reads = 0;
  const h = harness({
    readMode: () => {
      reads += 1;
      return {
        mode: reads === 1 ? "SEMI" : "PAUSE",
        updatedAt: new Date(ACTIVATION).toISOString(),
        updatedBy: "operator",
      };
    },
  });

  const result = await h.cycle();
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "MODE_CHANGED_UNDER_LOCK");
  assert.equal(h.saves.length, 0);
  assert.equal(h.protectCalls.length, 0);
  assert.equal(h.lockReleases.length, 1);
});

test("restart-safe PENDING ownership is reconciled through the existing protection executor instead of being duplicated", async () => {
  const pending = adoption();
  const h = harness({
    adoptionRepository: {
      findByTicket: async () => structuredClone(pending),
      listActive: async () => [structuredClone(pending)],
      save: async () => {
        throw new Error("existing ownership must not be recreated");
      },
    },
  });

  const result = await h.cycle();
  assert.equal(result.status, "PROTECTED");
  assert.deepEqual(h.protectCalls, ["304779839"]);
  assert.equal(h.saves.length, 0);
});
