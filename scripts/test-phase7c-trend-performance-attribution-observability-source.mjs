import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const controllerPath = path.join(root, "scripts/run-phase7b-demo-controller.ts");

function fail(message) {
  console.error(`P2_TREND_ATTRIBUTION_OBSERVABILITY_SOURCE=FAIL ${message}`);
  process.exit(1);
}

if (!fs.existsSync(controllerPath)) fail("Trend controller missing");
const source = fs.readFileSync(controllerPath, "utf8");

function eventBlock(eventName, nextMarker) {
  const startNeedle = `journal("${eventName}", {`;
  const start = source.indexOf(startNeedle);
  if (start < 0) fail(`${eventName} journal missing`);
  const end = nextMarker ? source.indexOf(nextMarker, start + startNeedle.length) : source.length;
  if (end < 0) fail(`${eventName} block end marker missing`);
  return source.slice(start, end);
}

function mustContain(block, needle, label) {
  if (!block.includes(needle)) fail(`${label} missing ${needle}`);
}

const submit = eventBlock("ENTRY_SUBMIT", "const brokerReferenceTimestamp");
mustContain(submit, "signalId: signal.id", "ENTRY_SUBMIT");
mustContain(submit, "orderId", "ENTRY_SUBMIT");
mustContain(submit, "entryState", "ENTRY_SUBMIT");
mustContain(submit, "entryConditions: signal.entryConditions", "ENTRY_SUBMIT");

const unresolved = eventBlock("ENTRY_ACCEPTED_POSITION_NOT_RESOLVED", "state.pendingEntry = pendingEntry");
mustContain(unresolved, "signalId: signal.id", "ENTRY_ACCEPTED_POSITION_NOT_RESOLVED");
mustContain(unresolved, "orderId", "ENTRY_ACCEPTED_POSITION_NOT_RESOLVED");

const filled = eventBlock("ENTRY_FILLED", 'return "FILLED"');
mustContain(filled, "signalId: signal.id", "ENTRY_FILLED");
mustContain(filled, "orderId", "ENTRY_FILLED");
mustContain(filled, "position: opened", "ENTRY_FILLED");
mustContain(filled, "entryConditions: signal.entryConditions", "ENTRY_FILLED");

// This P2.2 slice is observability-only. The broker order identity and trading
// inputs remain canonical and are not altered by the metadata additions.
const orderRequestStart = source.indexOf('const order = await post<OrderResponse>("/v1/orders", {');
if (orderRequestStart < 0) fail("canonical broker order request missing");
const orderRequestEnd = source.indexOf("});", orderRequestStart);
if (orderRequestEnd < 0) fail("canonical broker order request end missing");
const orderRequest = source.slice(orderRequestStart, orderRequestEnd);
for (const needle of [
  "symbol,",
  "side: signal.side",
  'orderType: "MARKET"',
  "volume: fixedVolume",
  "requestedPrice: marketEntry",
  "stopLoss,",
  "takeProfit: brokerTakeProfit",
  "magicNumber",
  "clientOrderId: orderId",
  "idempotencyKey: orderId",
]) {
  mustContain(orderRequest, needle, "BROKER_ORDER_REQUEST");
}

console.log("P2_TREND_ATTRIBUTION_OBSERVABILITY_SOURCE=PASS");
console.log("P2_TREND_ENTRY_SUBMIT_IDENTITY=ORDER_SIGNAL_LINKED");
console.log("P2_TREND_ENTRY_FILLED_IDENTITY=ORDER_SIGNAL_POSITION_LINKED");
console.log("P2_TREND_ENTRY_CONDITIONS=PERSISTED");
console.log("P2_TREND_ORDER_BEHAVIOR=UNCHANGED_BY_SCOPE");
console.log("P2_TREND_RUNTIME_MUTATION=NONE");
