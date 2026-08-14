import { Router, type Request, type Response } from "express";
import {
  getPhase7CAccountRisk,
  runPhase7CCanonicalBacktest,
  type Phase7CBacktestRequest,
} from "../services/phase7c.service";

const router = Router();

router.get("/account-risk", async (req: Request, res: Response) => {
  try {
    const riskPercent = Number(req.query.riskPercent ?? 0.25);
    const maxLot = Number(req.query.maxLot ?? 0.03);
    res.json(await getPhase7CAccountRisk(riskPercent, maxLot));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Phase 7C account/risk request failed." });
  }
});

router.post("/backtest", async (req: Request, res: Response) => {
  try {
    res.json(await runPhase7CCanonicalBacktest(req.body as Phase7CBacktestRequest));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Phase 7C backtest failed." });
  }
});

export default router;
