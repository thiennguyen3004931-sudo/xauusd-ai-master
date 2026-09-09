import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// RED contract: account-switch prerequisites must not masquerade as current bot/ARM state.
const sourcePath = resolve(
  process.cwd(),
  "apps/web/src/pages/Phase7CAccountRiskPage.tsx",
);
const source = readFileSync(sourcePath, "utf8");

function requireMatch(pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function requireAbsent(pattern, message) {
  if (pattern.test(source)) {
    throw new Error(message);
  }
}

requireMatch(
  /getPhase7CLiveArmControlCapability/,
  "Account & Risk must read canonical LIVE ARM capability for the current-state summary.",
);

requireMatch(
  /botPaused:\s*["']Bot phải PAUSE["']/,
  "Account-switch readiness must be labeled as a requirement: Bot phải PAUSE.",
);

requireMatch(
  /liveDisarmed:\s*["']LIVE phải DISARMED["']/,
  "Account-switch readiness must be labeled as a requirement: LIVE phải DISARMED.",
);

requireMatch(
  /zeroXauusdPositions:\s*["']XAUUSD positions phải = 0["']/,
  "Position readiness must be presented as a requirement, not current state.",
);

requireMatch(
  /bridgeMatchesSelectedAccount:\s*["']Bridge phải đúng tài khoản["']/,
  "Bridge readiness must be presented as a requirement.",
);

requireMatch(
  /TRẠNG THÁI HIỆN TẠI/,
  "The page must explicitly separate current operational state from switch prerequisites.",
);

requireMatch(
  /ĐIỀU KIỆN ĐỂ ĐỔI TÀI KHOẢN/,
  "The readiness checklist must be titled as account-switch prerequisites.",
);

requireMatch(
  /Bot hiện tại:/,
  "The page must explicitly show the current bot mode.",
);

requireMatch(
  /LIVE ARM hiện tại:/,
  "The page must explicitly show the current LIVE ARM status.",
);

requireMatch(
  /chuyển Bot về PAUSE, sau đó DISARM LIVE/,
  "Blocked LIVE account-switch guidance must state the safe PAUSE then DISARM sequence.",
);

requireMatch(
  /passed \? ["']ĐẠT["'] : ["']CẦN XỬ LÝ["']/,
  "Requirement rows must use operator-facing ĐẠT/CẦN XỬ LÝ semantics.",
);

requireAbsent(
  /botPaused:\s*["']Bot đang PAUSE["']/,
  "Misleading current-state wording Bot đang PAUSE must be removed from readiness labels.",
);

requireAbsent(
  /liveDisarmed:\s*["']LIVE đã DISARMED["']/,
  "Misleading current-state wording LIVE đã DISARMED must be removed from readiness labels.",
);

console.log("PHASE7C_ACCOUNT_RISK_READINESS_SEMANTICS=PASS");
