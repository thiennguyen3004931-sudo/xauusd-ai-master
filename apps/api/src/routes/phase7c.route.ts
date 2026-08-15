import { Router, type Request, type Response } from "express";
import {
  runPhase7CCanonicalBacktest,
  type Phase7CBacktestRequest,
} from "../services/phase7c.service";
import { getPhase7CForwardRange } from "../services/phase7c-forward.service";
import { getPhase7CAutoLotPreview } from "../services/phase7c-autolot.service";
import { getPhase7CCanonicalAccountRisk } from "../services/phase7c-risk-view.service";
import {
  runPhase7CAutoLotBacktestComparison,
  type Phase7CAutoLotBacktestRequest,
} from "../services/phase7c-auto-lot.service";
import {
  getPhase7CBotModeOptions,
  isPhase7CBotMode,
  phase7CBotModeService,
} from "../services/phase7c-bot-mode.service";
import { getPhase7CLiveRegime } from "../services/phase7c-live-regime.service";

const router = Router();

function isLoopbackRequest(req: Request): boolean {
  const addresses = [req.ip, req.socket.remoteAddress]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  return addresses.some((value) =>
    value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1");
}

function canChangeBotMode(req: Request): boolean {
  if (isLoopbackRequest(req)) return true;
  const configuredToken = process.env.PHASE7C_BOT_MODE_TOKEN?.trim();
  if (!configuredToken) return false;
  const providedToken = String(req.header("x-phase7c-token") ?? "").trim();
  return providedToken === configuredToken;
}

router.get("/bot-mode", (_req: Request, res: Response) => {
  res.json({
    state: phase7CBotModeService.get(),
    options: getPhase7CBotModeOptions(),
  });
});

router.post("/bot-mode", (req: Request, res: Response) => {
  if (!canChangeBotMode(req)) {
    res.status(403).json({
      error: "Bot mode changes are restricted to localhost unless PHASE7C_BOT_MODE_TOKEN is configured.",
    });
    return;
  }

  const requestedMode = typeof req.body?.mode === "string"
    ? req.body.mode.trim().toUpperCase()
    : req.body?.mode;
  if (!isPhase7CBotMode(requestedMode)) {
    res.status(400).json({
      error: `Invalid bot mode. Expected one of: ${getPhase7CBotModeOptions().join(", ")}.`,
    });
    return;
  }

  const source = typeof req.body?.source === "string" && req.body.source.trim()
    ? req.body.source.trim().slice(0, 80)
    : "operator";

  res.json({
    state: phase7CBotModeService.set(requestedMode, source),
    options: getPhase7CBotModeOptions(),
  });
});

router.get("/live-regime", async (req: Request, res: Response) => {
  try {
    const symbol = String(req.query.symbol ?? "XAUUSD").trim().toUpperCase();
    const count = Number(req.query.count ?? 320);
    res.json(await getPhase7CLiveRegime(symbol || "XAUUSD", count));
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : "Phase 7C live regime detection failed.",
    });
  }
});

router.get("/account-risk", async (req: Request, res: Response) => {
  try {
    const riskPercent = Number(req.query.riskPercent ?? 0.25);
    const maxLot = Number(req.query.maxLot ?? 0.03);
    res.json(await getPhase7CCanonicalAccountRisk(riskPercent, maxLot));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Phase 7C account/risk request failed." });
  }
});

router.get("/auto-lot-preview", async (req: Request, res: Response) => {
  try {
    const stopDistance = Number(req.query.stopDistance);
    const riskPercent = Number(req.query.riskPercent ?? 0.25);
    const maxLot = Number(req.query.maxLot ?? 0.03);
    res.json(await getPhase7CAutoLotPreview(stopDistance, riskPercent, maxLot));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Phase 7C Auto Lot preview failed." });
  }
});

router.get("/forward-range", async (req: Request, res: Response) => {
  try {
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    res.json(await getPhase7CForwardRange(from, to));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Phase 7C forward comparison failed." });
  }
});

router.post("/backtest", async (req: Request, res: Response) => {
  try {
    res.json(await runPhase7CCanonicalBacktest(req.body as Phase7CBacktestRequest));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Phase 7C backtest failed." });
  }
});

router.post("/auto-lot-backtest", async (req: Request, res: Response) => {
  try {
    res.json(await runPhase7CAutoLotBacktestComparison(req.body as Phase7CAutoLotBacktestRequest));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Phase 7C Auto Lot backtest comparison failed." });
  }
});

export default router;
