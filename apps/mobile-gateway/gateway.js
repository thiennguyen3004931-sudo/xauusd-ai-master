"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createMobileGatewayServer } = require("./server.cjs");

const CONFIG_PATH = process.env.XAUUSD_MOBILE_GATEWAY_CONFIG ||
  "C:\\ProgramData\\XAUUSD-AI-MASTER\\mobile-readonly-gateway\\gateway.config.json";

function loadConfig(filePath = CONFIG_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  const config = JSON.parse(raw);
  if (config.listenHost !== "127.0.0.1") throw new Error("GATEWAY_LISTEN_HOST_MUST_BE_LOOPBACK");
  if (!Number.isInteger(config.listenPort) || config.listenPort <= 0 || config.listenPort > 65535) {
    throw new Error("GATEWAY_LISTEN_PORT_INVALID");
  }
  if (!Array.isArray(config.allowedUsers) || config.allowedUsers.length === 0) {
    throw new Error("GATEWAY_ALLOWED_USERS_REQUIRED");
  }
  return config;
}

function start() {
  const config = loadConfig();
  const server = createMobileGatewayServer({ config });
  server.listen(config.listenPort, config.listenHost, () => {
    process.stdout.write(`MOBILE_GATEWAY_LISTENING=${config.listenHost}:${config.listenPort}\n`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { CONFIG_PATH, loadConfig, start };
