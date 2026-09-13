"use strict";

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

function normalizedIdentity(value) {
  return String(value ?? "").trim().toLowerCase();
}

function allowedIdentity(req, config) {
  const actual = normalizedIdentity(req.headers["tailscale-user-login"]);
  const allowed = new Set((config.allowedUsers ?? []).map(normalizedIdentity).filter(Boolean));
  return Boolean(actual) && allowed.has(actual);
}

function writeJson(res, statusCode, payload, method = "GET") {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-length", Buffer.byteLength(body));
  if (method === "HEAD") return res.end();
  res.end(body);
}

function upstreamHeaders(req) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower.startsWith("tailscale-")) continue;
    if (lower === "host" || lower === "content-length") continue;
    if (value !== undefined) headers[name] = value;
  }
  headers["x-m4-mobile-readonly"] = "1";
  return headers;
}

async function proxyReadOnly(req, res, config, fetchImpl) {
  const target = new URL(req.url || "/", config.webOrigin);
  let upstream;
  try {
    upstream = await fetchImpl(target, {
      method: req.method,
      headers: upstreamHeaders(req),
      redirect: "manual",
      cache: "no-store",
    });
  } catch (error) {
    return writeJson(res, 502, {
      error: "WEB_UPSTREAM_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Web upstream unavailable.",
    }, req.method);
  }

  res.statusCode = upstream.status;
  for (const [name, value] of upstream.headers.entries()) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === "content-length") continue;
    res.setHeader(name, value);
  }

  if (req.method === "HEAD") return res.end();
  const body = Buffer.from(await upstream.arrayBuffer());
  res.setHeader("content-length", body.length);
  res.end(body);
}

function createMobileGatewayServer({ config, broker = null, fetchImpl = fetch } = {}) {
  if (!config || typeof config !== "object") throw new Error("GATEWAY_CONFIG_REQUIRED");
  if (!config.webOrigin) throw new Error("WEB_ORIGIN_REQUIRED");

  return http.createServer(async (req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const path = new URL(req.url || "/", "http://127.0.0.1").pathname;

    if (path === "/__m2/health") {
      if (method !== "GET" && method !== "HEAD") {
        return writeJson(res, 405, { error: "METHOD_NOT_ALLOWED" }, method);
      }
      return writeJson(res, 200, {
        ok: true,
        service: "phase7c-mobile-gateway",
        mode: broker ? "M4" : "M2_READ_ONLY",
      }, method);
    }

    if (path.startsWith("/__m4/")) {
      return writeJson(res, 404, { error: "M4_NOT_ENABLED" }, method);
    }

    if (method !== "GET" && method !== "HEAD") {
      return writeJson(res, 405, { error: "METHOD_NOT_ALLOWED" }, method);
    }

    if (!allowedIdentity(req, config)) {
      return writeJson(res, 403, { error: "TAILSCALE_IDENTITY_REQUIRED" }, method);
    }

    return proxyReadOnly(req, res, config, fetchImpl);
  });
}

module.exports = {
  createMobileGatewayServer,
  normalizedIdentity,
};
