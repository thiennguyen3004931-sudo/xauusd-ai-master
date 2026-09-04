import { Router, type Request, type Response } from "express";
import { getPhase7CPerformanceIntelligence } from "../services/phase7c-performance-intelligence.service";

const router = Router();

function readDays(value: unknown): number {
  if (value === undefined) return 90;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 7 || days > 365) {
    throw new Error("days must be an integer between 7 and 365.");
  }
  return days;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const days = readDays(req.query.days);
    const symbol = typeof req.query.symbol === "string" ? req.query.symbol : "XAUUSD";
    res.setHeader("cache-control", "no-store");
    res.json(await getPhase7CPerformanceIntelligence(days, symbol));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not build Phase7C performance intelligence.",
    });
  }
});

export default router;
