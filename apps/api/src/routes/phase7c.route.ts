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

const router = Router();

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
