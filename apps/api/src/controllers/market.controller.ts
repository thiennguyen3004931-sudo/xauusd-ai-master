import type { Request, Response } from "express";

import * as marketService from "../services/market.service";

export async function getQuote(
  _req: Request,
  res: Response
) {

  const data =
    await marketService.getQuote();

  res.json({
    success: true,
    data,
    timestamp: Date.now(),
  });

}

export async function getCandles(
  req: Request,
  res: Response
) {

  const symbol =
    String(req.query.symbol ?? "XAUUSD");

  const tf =
    String(req.query.tf ?? "M5");

  const limit =
    Number(req.query.limit ?? 500);

  const data =
    await marketService.getCandles(
      symbol,
      tf,
      limit
    );

  res.json({
    success: true,
    data,
    timestamp: Date.now(),
  });

}