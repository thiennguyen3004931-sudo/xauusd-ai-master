const fs = require("node:fs");
const path = require("node:path");
const { createMobileGatewayServer, validateConfig } = require("./server.cjs");

const DEFAULT_CONFIG_PATH =
  "C:\\ProgramData\\XAUUSD-AI-MASTER\\mobile-readonly-gateway\\gateway.config.json";

function loadConfig(configPath = process.env.XAUUSD_MOBILE_GATEWAY_CONFIG || DEFAULT_CONFIG_PATH) {
  const absolute = path.resolve(configPath);
  const raw = fs.readFileSync(absolute, "utf8");
  const config = JSON.parse(raw);
  return validateConfig(config);
}

function main() {
  const config = loadConfig();
  const server = createMobileGatewayServer({ config });
  server.listen(config.listenPort, config.listenHost, () => {
    const address = server.address();
    process.stdout.write(
      `MOBILE_GATEWAY_LISTENING=${address.address}:${address.port}\nMODE=READ_ONLY_BASELINE\n`,
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = { DEFAULT_CONFIG_PATH, loadConfig, main };
