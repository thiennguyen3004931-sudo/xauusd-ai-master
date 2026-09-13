import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createMobileGatewayServer } = require("../server.cjs");

const TRUSTED_USER = "thiennguyen300493@gmail.com";
const TRUSTED_ORIGIN = "https://emlvt-dt-1.taila2e32b.ts.net:8443";

let upstream;
let upstreamOrigin;
let gateway;
let gatewayOrigin;
let upstreamRequests = [];

function listen(server, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve(server.address()));
  });
}

function close(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function request(method, path, headers = {}) {
  const response = await fetch(`${gatewayOrigin}${path}`, {
    method,
    headers,
    redirect: "manual",
  });
  return {
    status: response.status,
    text: method === "HEAD" ? "" : await response.text(),
  };
}

before(async () => {
  upstream = http.createServer((req, res) => {
    upstreamRequests.push({ method: req.method, url: req.url });
    if (req.url === "/phase7c-mobile") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (req.method !== "HEAD") res.end("MOBILE_OK");
      else res.end();
      return;
    }
    res.statusCode = 404;
    res.end("NOT_FOUND");
  });
  const upstreamAddress = await listen(upstream);
  upstreamOrigin = `http://127.0.0.1:${upstreamAddress.port}`;

  gateway = createMobileGatewayServer({
    config: {
      listenHost: "127.0.0.1",
      listenPort: 0,
      webOrigin: upstreamOrigin,
      apiOrigin: "http://127.0.0.1:3711",
      allowedUsers: [TRUSTED_USER],
      allowedOrigin: TRUSTED_ORIGIN,
      auditPath: "ignored-in-readonly-test.jsonl",
    },
    broker: null,
    fetchImpl: fetch,
  });
  const gatewayAddress = await listen(gateway);
  gatewayOrigin = `http://127.0.0.1:${gatewayAddress.port}`;
});

after(async () => {
  await close(gateway);
  await close(upstream);
});

test("health remains locally available", async () => {
  const result = await request("GET", "/__m2/health");
  assert.equal(result.status, 200);
  const payload = JSON.parse(result.text);
  assert.equal(payload.ok, true);
});

test("trusted Tailscale identity can GET mobile page", async () => {
  const result = await request("GET", "/phase7c-mobile", {
    "Tailscale-User-Login": TRUSTED_USER,
  });
  assert.equal(result.status, 200);
  assert.equal(result.text, "MOBILE_OK");
});

test("trusted Tailscale identity can HEAD mobile page", async () => {
  const result = await request("HEAD", "/phase7c-mobile", {
    "Tailscale-User-Login": TRUSTED_USER,
  });
  assert.equal(result.status, 200);
});

test("direct mobile page access without identity is forbidden", async () => {
  const result = await request("GET", "/phase7c-mobile");
  assert.equal(result.status, 403);
});

test("non-read-only method stays blocked outside exact M4 routes", async () => {
  const result = await request("POST", "/phase7c-mobile", {
    "Tailscale-User-Login": TRUSTED_USER,
    Origin: TRUSTED_ORIGIN,
  });
  assert.equal(result.status, 405);
});

test("network-path input remains on the configured Web upstream", async () => {
  const beforeCount = upstreamRequests.length;
  const result = await request("GET", "//127.0.0.1:1/escape", {
    "Tailscale-User-Login": TRUSTED_USER,
  });
  assert.equal(result.status, 404);
  assert.equal(upstreamRequests.length, beforeCount + 1);
  assert.equal(upstreamRequests.at(-1).url, "/escape");
});

test("production-configured gateway binds loopback only", () => {
  const address = gateway.address();
  assert.equal(address.address, "127.0.0.1");
});
