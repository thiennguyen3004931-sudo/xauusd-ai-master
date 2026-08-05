import { Router } from "express";

const router = Router();

router.get("/", (_, res) => {

  res.json({
    success: true,

    data: {
      status: "OK",
      service: "XAUUSD AI MASTER API",
      version: "2.0.0"
    },

    timestamp: Date.now()
  });

});

export default router;