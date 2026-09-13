const http = require("node:http");
const { URL } = require("node:url");

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function normalizeIdentity(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isReadOnly(method) {
  return method === "GET" || method === "HEAD";
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function trustedIdentity(req, allowedUsers) {
  const identity = normalizeIdentity(req.headers["tailscale-user-login"]);
  if (!identity) return null;
  const allowed = new Set((allowedUsers ?? []).map(normalizeIdentity).filter(Boolean));
  return allowed.has(identity) ? identity : null;
}

function upstreamHeaders(req) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower.startsWith("tailscale-")) continue;
    if (lower === "host") continue;
    if (value === undefined) continue;
    headers[name] = value;
  }
  return headers;
}

function responseHeaders(upstreamResponse, res) {
  for (const [name, value] of upstreamResponse.headers.entries()) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    res.setHeader(name, value);
  }
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-m4-gateway", "readonly-baseline");
}

function validateConfig(config) {
  if (!config || typeof config !== "object") throw new Error("GATEWAY_CONFIG_REQUIRED");
  if (config.listenHost !== "127.0.0.1") throw new Error("GATEWAY_LISTEN_HOST_MUST_BE_LOOPBACK");
  if (!Number.isInteger(config.listenPort) || config.listenPort < 0 || config.listenPort > 65535) {
    throw new Error("GATEWAY_LISTEN_PORT_INVALID");
  }
  const web = new URL(config.webOrigin);
  const api = new URL(config.apiOrigin);
  if (web.hostname !== "127.0.0.1" && web.hostname !== "localhost") {
    throw new Error("WEB_ORIGIN_MUST_BE_LOOPBACK");
  }
  if (api.hostname !== "127.0.0.1" && api.hostname !== "localhost") {
    throw new Error("API_ORIGIN_MUST_BE_LOOPBACK");
  }
  if (!Array.isArray(config.allowedUsers) || config.allowedUsers.map(normalizeIdentity).filter(Boolean).length === 0) {
    throw new Error("GATEWAY_ALLOWED_USERS_REQUIRED");
  }
  return config;
}

function createMobileGatewayServer({ config, broker = null, fetchImpl = fetch }) {
  validateConfig(config);
  void broker;

  return http.createServer(async (req, res) => {
    const method = String(req.method ?? "GET").toUpperCase();
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/__m2/health") {
      if (method !== "GET" && method !== "HEAD") {
        writeJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
        return;
      }
      writeJson(res, 200, { ok: true, mode: "READ_ONLY_BASELINE" });
      return;
    }

    if (!isReadOnly(method)) {
      writeJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const identity = trustedIdentity(req, config.allowedUsers);
    if (!identity) {
      writeJson(res, 403, { ok: false, error: "TAILSCALE_IDENTITY_REQUIRED" });
      return;
    }

    try {
      const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, config.webOrigin);
      const upstreamResponse = await fetchImpl(target, {
        method,
        headers: upstreamHeaders(req),
        redirect: "manual",
        cache: "no-store",
      });

      res.statusCode = upstreamResponse.status;
      responseHeaders(upstreamResponse, res);
      if (method === "HEAD") {
        res.end();
        return;
      }
      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      res.end(body);
    } catch (error) {
      writeJson(res, 502, {
        ok: false,
        error: "WEB_UPSTREAM_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Unknown upstream error",
      });
    }
  });
}

module.exports = {
  createMobileGatewayServer,
  normalizeIdentity,
  trustedIdentity,
  validateConfig,
};
