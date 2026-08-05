import express from "express";
import cors from "cors";

import healthRouter from "./routes/health.route";
import marketRouter from "./routes/market.route";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/market", marketRouter);

export default app;