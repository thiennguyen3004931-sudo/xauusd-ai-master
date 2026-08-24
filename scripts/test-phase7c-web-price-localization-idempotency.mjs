import assert from "node:assert/strict";

await import(new URL("../apps/web/public/phase7c-vi-user.js", import.meta.url));
const translate = globalThis.__PHASE7C_VI_TEST__?.translate;
assert.equal(typeof translate, "function", "translation test hook is available");

const quote = "Bid 4648.41 · Ask 4648.77 · Spread 0.36";
const once = translate(quote);
assert.equal(once, "Giá Bid 4648.41 · Giá Ask 4648.77 · Spread 0.36");
assert.equal(translate(once), once, "quote translation must be idempotent");
assert.equal(translate(translate(once)), once, "repeated observer passes must not grow labels");

assert.equal(
  translate("Giá Giá Giá Giá Bid 4648.41 · Giá Giá Ask 4648.77"),
  "Giá Bid 4648.41 · Giá Ask 4648.77",
  "legacy repeated Giá artifacts are collapsed",
);

console.log("PHASE7C_WEB_PRICE_LOCALIZATION_IDEMPOTENCY_TEST=PASS");
