import type { Candle } from "../../market/types/candle";

import { detectSwingHigh } from "./swing/swing-high";
import { detectSwingLow } from "./swing/swing-low";

import { detectBOS } from "./bos.detector";
import { detectCHOCH } from "./choch.detector";
import { detectLiquiditySweep } from "./liquidity.detector";
import { detectOrderBlock } from "./ob.detector";
import { detectFVG } from "./fvg.detector";

export function buildSMC(
  candles: Candle[]
) {
  const swingHigh =
    detectSwingHigh(candles);

  const swingLow =
    detectSwingLow(candles);

  const bos = detectBOS(
    candles,
    swingHigh ?? 0,
    swingLow ?? 0
  );

  const choch = detectCHOCH(
    bos.bullish,
    bos.bearish
  );

  return {
    swingHigh,
    swingLow,

    bos,

    choch,

    liquidity:
      detectLiquiditySweep(0.2),

    orderBlock:
      detectOrderBlock(),

    fvg:
      detectFVG(),
  };
}