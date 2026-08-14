import { Router, type Request, type Response } from "express";
import {
  runPhase7ESupertrendResearch,
  type Phase7ESupertrendRequest,
} from "../services/phase7e-supertrend.service";

const router = Router();

router.post("/supertrend-backtest", async (req: Request, res: Response) => {
  try {
    res.json(await runPhase7ESupertrendResearch(req.body as Phase7ESupertrendRequest));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Phase 7E dual Supertrend research failed.",
    });
  }
});

export default router;
