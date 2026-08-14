import { Router, type Request, type Response } from "express";
import {
  runPhase7DDailyPnlResearch,
  type Phase7DDailyPnlRequest,
} from "../services/phase7d-daily-pnl.service";

const router = Router();

router.post("/daily-pnl-backtest", async (req: Request, res: Response) => {
  try {
    res.json(await runPhase7DDailyPnlResearch(req.body as Phase7DDailyPnlRequest));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Phase 7D daily P/L research failed.",
    });
  }
});

export default router;
