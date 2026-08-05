import express from "express";

const app = express();

const PORT = 3000;

app.get("/health", (_, res) => {
  res.json({
    status: "OK",
    service: "XAUUSD AI MASTER API",
    version: "1.0.0"
  });
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});