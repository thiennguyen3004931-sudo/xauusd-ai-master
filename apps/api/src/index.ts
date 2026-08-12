import "dotenv/config";
import app from "./app";
import {
  startAutoExecutionSoak,
  stopAutoExecutionSoak,
} from "./services/auto-execution-soak.service";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";

app.listen(PORT, HOST, () => {
  console.log(`XAUUSD API running at http://${HOST}:${PORT}`);
  console.log("Trading mode defaults to SHADOW. Live execution is not exposed by this API.");
});
startAutoExecutionSoak();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopAutoExecutionSoak();
  });
}
