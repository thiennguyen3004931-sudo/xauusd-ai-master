import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  route: path.join(root, "apps/api/src/routes/phase7c.route.ts"),
  types: path.join(root, "apps/web/src/phase7c-types.ts"),
  api: path.join(root, "apps/web/src/api.ts"),
  page: path.join(root, "apps/web/src/pages/Phase7CControlCenterPage.tsx"),
};

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceOnce(input, from, to, label) {
  const first = input.indexOf(from);
  if (first < 0) throw new Error(`Missing patch marker: ${label}`);
  if (input.indexOf(from, first + from.length) >= 0) throw new Error(`Patch marker is not unique: ${label}`);
  return input.slice(0, first) + to + input.slice(first + from.length);
}

let route = read(files.route);
let types = read(files.types);
let api = read(files.api);
let page = read(files.page);

if (route.includes("trendFixedTpEnabled: req.body?.trendFixedTpEnabled === true") ||
    types.includes("export interface Phase7CLotSettingsState {\n  version: 2;") ||
    api.includes("trendFixedTpEnabled: boolean;") ||
    page.includes("const configuredTrendFixedTpEnabled =")) {
  console.log("FIXED_TP_API_WEB_PATCH=ALREADY_APPLIED");
  process.exit(0);
}

route = replaceOnce(
  route,
  `    const input = validatePhase7CLotSettings({\n      trendFixedLot: Number(req.body?.trendFixedLot),\n      sidewayRiskPercent: Number(req.body?.sidewayRiskPercent),\n      sidewayMaxLot: Number(req.body?.sidewayMaxLot),\n    });`,
  `    const input = validatePhase7CLotSettings({\n      trendFixedLot: Number(req.body?.trendFixedLot),\n      sidewayRiskPercent: Number(req.body?.sidewayRiskPercent),\n      sidewayMaxLot: Number(req.body?.sidewayMaxLot),\n      trendFixedTpEnabled: req.body?.trendFixedTpEnabled === true,\n      trendFixedTpDistance: Number(req.body?.trendFixedTpDistance),\n      sidewayFixedTpEnabled: req.body?.sidewayFixedTpEnabled === true,\n      sidewayFixedTpDistance: Number(req.body?.sidewayFixedTpDistance),\n    });`,
  "API canonical lot-settings validation input",
);

types = replaceOnce(
  types,
  `export interface Phase7CLotSettingsState {\n  version: 1;\n  trendFixedLot: number;\n  sidewayRiskPercent: number;\n  sidewayMaxLot: number;\n  updatedAt: string;\n  updatedBy: string;\n}\n\nexport interface Phase7CActiveLotSettings {\n  version: 1;\n  trendFixedLot: number;\n  sidewayRiskPercent: number;\n  sidewayMaxLot: number;\n  armed: boolean;\n  supervisorPid: number;\n  appliedAt: string;\n}`,
  `export interface Phase7CLotSettingsState {\n  version: 2;\n  trendFixedLot: number;\n  sidewayRiskPercent: number;\n  sidewayMaxLot: number;\n  trendFixedTpEnabled: boolean;\n  trendFixedTpDistance: number;\n  sidewayFixedTpEnabled: boolean;\n  sidewayFixedTpDistance: number;\n  updatedAt: string;\n  updatedBy: string;\n}\n\nexport interface Phase7CActiveLotSettings {\n  version: 2;\n  accountMode: \"DEMO\" | \"LIVE\";\n  trendFixedLot: number;\n  sidewayRiskPercent: number;\n  sidewayMaxLot: number;\n  trendFixedTpEnabled: boolean;\n  trendFixedTpDistance: number;\n  sidewayFixedTpEnabled: boolean;\n  sidewayFixedTpDistance: number;\n  armed: boolean;\n  supervisorPid: number;\n  appliedAt: string;\n}`,
  "Web schema-v2 settings types",
);

api = replaceOnce(
  api,
  `export async function setPhase7CLotSettings(input: { trendFixedLot: number; sidewayRiskPercent: number; sidewayMaxLot: number }): Promise<Phase7CLotSettingsSnapshot> {`,
  `export async function setPhase7CLotSettings(input: {\n  trendFixedLot: number;\n  sidewayRiskPercent: number;\n  sidewayMaxLot: number;\n  trendFixedTpEnabled: boolean;\n  trendFixedTpDistance: number;\n  sidewayFixedTpEnabled: boolean;\n  sidewayFixedTpDistance: number;\n}): Promise<Phase7CLotSettingsSnapshot> {`,
  "Web canonical settings mutation input",
);

page = replaceOnce(
  page,
  `  Grid,\n  LinearProgress,`,
  `  FormControlLabel,\n  Grid,\n  LinearProgress,`,
  "MUI FormControlLabel import",
);
page = replaceOnce(
  page,
  `  TableRow,\n  TextField,`,
  `  TableRow,\n  TextField,\n  Switch,`,
  "MUI Switch import",
);

page = replaceOnce(
  page,
  `  const configuredTrendLot = lotSettings.data?.state.trendFixedLot ?? 0.03;\n  const configuredSidewayRisk = lotSettings.data?.state.sidewayRiskPercent ?? 0.25;\n  const configuredSidewayMaxLot = lotSettings.data?.state.sidewayMaxLot ?? 0.03;`,
  `  const configuredTrendLot = lotSettings.data?.state.trendFixedLot ?? 0.03;\n  const configuredSidewayRisk = lotSettings.data?.state.sidewayRiskPercent ?? 0.25;\n  const configuredSidewayMaxLot = lotSettings.data?.state.sidewayMaxLot ?? 0.03;\n  const configuredTrendFixedTpEnabled = lotSettings.data?.state.trendFixedTpEnabled ?? false;\n  const configuredTrendFixedTpDistance = lotSettings.data?.state.trendFixedTpDistance ?? 0;\n  const configuredSidewayFixedTpEnabled = lotSettings.data?.state.sidewayFixedTpEnabled ?? false;\n  const configuredSidewayFixedTpDistance = lotSettings.data?.state.sidewayFixedTpDistance ?? 0;\n  const activeTrendFixedTpEnabled = lotSettings.data?.active?.trendFixedTpEnabled ?? false;\n  const activeTrendFixedTpDistance = lotSettings.data?.active?.trendFixedTpDistance ?? 0;\n  const activeSidewayFixedTpEnabled = lotSettings.data?.active?.sidewayFixedTpEnabled ?? false;\n  const activeSidewayFixedTpDistance = lotSettings.data?.active?.sidewayFixedTpDistance ?? 0;`,
  "configured and active Fixed TP visibility",
);

page = replaceOnce(
  page,
  `  const [lotDraft, setLotDraft] = useState<{\n    trendFixedLot: number;\n    sidewayRiskPercent: number;\n    sidewayMaxLot: number;\n  } | null>(null);\n  const trendFixedLot = lotDraft?.trendFixedLot ?? configuredTrendLot;\n  const sidewayRiskPercent = lotDraft?.sidewayRiskPercent ?? configuredSidewayRisk;\n  const sidewayMaxLot = lotDraft?.sidewayMaxLot ?? configuredSidewayMaxLot;\n  const updateLotDraft = (patch: Partial<NonNullable<typeof lotDraft>>) => {\n    setLotDraft((current) => ({\n      trendFixedLot: current?.trendFixedLot ?? configuredTrendLot,\n      sidewayRiskPercent: current?.sidewayRiskPercent ?? configuredSidewayRisk,\n      sidewayMaxLot: current?.sidewayMaxLot ?? configuredSidewayMaxLot,\n      ...patch,\n    }));\n  };`,
  `  const [lotDraft, setLotDraft] = useState<{\n    trendFixedLot: number;\n    sidewayRiskPercent: number;\n    sidewayMaxLot: number;\n    trendFixedTpEnabled: boolean;\n    trendFixedTpDistance: number;\n    sidewayFixedTpEnabled: boolean;\n    sidewayFixedTpDistance: number;\n  } | null>(null);\n  const trendFixedLot = lotDraft?.trendFixedLot ?? configuredTrendLot;\n  const sidewayRiskPercent = lotDraft?.sidewayRiskPercent ?? configuredSidewayRisk;\n  const sidewayMaxLot = lotDraft?.sidewayMaxLot ?? configuredSidewayMaxLot;\n  const trendFixedTpEnabled = lotDraft?.trendFixedTpEnabled ?? configuredTrendFixedTpEnabled;\n  const trendFixedTpDistance = lotDraft?.trendFixedTpDistance ?? configuredTrendFixedTpDistance;\n  const sidewayFixedTpEnabled = lotDraft?.sidewayFixedTpEnabled ?? configuredSidewayFixedTpEnabled;\n  const sidewayFixedTpDistance = lotDraft?.sidewayFixedTpDistance ?? configuredSidewayFixedTpDistance;\n  const updateLotDraft = (patch: Partial<NonNullable<typeof lotDraft>>) => {\n    setLotDraft((current) => ({\n      trendFixedLot: current?.trendFixedLot ?? configuredTrendLot,\n      sidewayRiskPercent: current?.sidewayRiskPercent ?? configuredSidewayRisk,\n      sidewayMaxLot: current?.sidewayMaxLot ?? configuredSidewayMaxLot,\n      trendFixedTpEnabled: current?.trendFixedTpEnabled ?? configuredTrendFixedTpEnabled,\n      trendFixedTpDistance: current?.trendFixedTpDistance ?? configuredTrendFixedTpDistance,\n      sidewayFixedTpEnabled: current?.sidewayFixedTpEnabled ?? configuredSidewayFixedTpEnabled,\n      sidewayFixedTpDistance: current?.sidewayFixedTpDistance ?? configuredSidewayFixedTpDistance,\n      ...patch,\n    }));\n  };`,
  "Control Center seven-field draft",
);

page = replaceOnce(
  page,
  `  const canChangeLot =\n    mode === "PAUSE" &&\n    bridgeReady &&\n    lifecycleData?.bridge.accountMode === "demo" &&\n    (lifecycleData?.bridge.openXauusdPositions ?? 0) === 0;`,
  `  const canChangeLot =\n    mode === "PAUSE" &&\n    bridgeReady &&\n    brokerModeSupported &&\n    (lifecycleData?.bridge.openXauusdPositions ?? 0) === 0;`,
  "account-mode-aware settings UI gate",
);

page = replaceOnce(
  page,
  `<Typography variant="caption" color="text.secondary">DEMO only · không martingale · không thay đổi vị thế đang quản lý.</Typography>`,
  `<Typography variant="caption" color="text.secondary">DEMO/LIVE theo account mode canonical · NEW_POSITIONS_ONLY · không martingale · không thay đổi vị thế đang quản lý.</Typography>`,
  "NEW_POSITIONS_ONLY settings notice",
);

page = replaceOnce(
  page,
  `              <Chip label={\`Cap \${configuredSidewayMaxLot.toFixed(2)} lot\`} variant="outlined" />\n              <Button component={RouterLink}`,
  `              <Chip label={\`Cap \${configuredSidewayMaxLot.toFixed(2)} lot\`} variant="outlined" />\n              <Chip label={\`Configured Trend TP · \${configuredTrendFixedTpEnabled ? \`\${configuredTrendFixedTpDistance.toFixed(2)} giá\` : "OFF"}\`} variant="outlined" />\n              <Chip label={\`Active Trend TP · \${lotSettings.data?.active ? (activeTrendFixedTpEnabled ? \`\${activeTrendFixedTpDistance.toFixed(2)} giá\` : "OFF") : "—"}\`} variant="outlined" />\n              <Chip label={\`Configured Sideway TP · \${configuredSidewayFixedTpEnabled ? \`\${configuredSidewayFixedTpDistance.toFixed(2)} giá\` : "OFF"}\`} variant="outlined" />\n              <Chip label={\`Active Sideway TP · \${lotSettings.data?.active ? (activeSidewayFixedTpEnabled ? \`\${activeSidewayFixedTpDistance.toFixed(2)} giá\` : "OFF") : "—"}\`} variant="outlined" />\n              <Button component={RouterLink}`,
  "configured and active TP chips",
);

page = replaceOnce(
  page,
  `          <Grid container spacing={2} sx={{ mt: 0.5 }}>\n            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Trend fixed lot" value={trendFixedLot} onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }} /></Grid>\n            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Sideway risk / lệnh (%)" value={sidewayRiskPercent} onChange={(event) => updateLotDraft({ sidewayRiskPercent: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.01, max: 1, step: 0.01 } }} /></Grid>\n            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Sideway max lot" value={sidewayMaxLot} onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }} /></Grid>\n          </Grid>`,
  `          <Grid container spacing={2} sx={{ mt: 0.5 }}>\n            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Trend fixed lot" value={trendFixedLot} onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }} /></Grid>\n            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Sideway risk / lệnh (%)" value={sidewayRiskPercent} onChange={(event) => updateLotDraft({ sidewayRiskPercent: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.01, max: 1, step: 0.01 } }} /></Grid>\n            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Sideway max lot" value={sidewayMaxLot} onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 1.2, step: 0.03 } }} /></Grid>\n          </Grid>\n\n          <Grid container spacing={2} sx={{ mt: 0.5 }}>\n            <Grid size={{ xs: 12, sm: 3 }}><FormControlLabel control={<Switch checked={trendFixedTpEnabled} onChange={(event) => updateLotDraft({ trendFixedTpEnabled: event.target.checked })} />} label="Trend Fixed TP" /></Grid>\n            <Grid size={{ xs: 12, sm: 3 }}><TextField fullWidth size="small" type="number" label="Trend Fixed TP distance" value={trendFixedTpDistance} disabled={!trendFixedTpEnabled} onChange={(event) => updateLotDraft({ trendFixedTpDistance: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} /></Grid>\n            <Grid size={{ xs: 12, sm: 3 }}><FormControlLabel control={<Switch checked={sidewayFixedTpEnabled} onChange={(event) => updateLotDraft({ sidewayFixedTpEnabled: event.target.checked })} />} label="Sideway Fixed TP" /></Grid>\n            <Grid size={{ xs: 12, sm: 3 }}><TextField fullWidth size="small" type="number" label="Sideway Fixed TP distance" value={sidewayFixedTpDistance} disabled={!sidewayFixedTpEnabled} onChange={(event) => updateLotDraft({ sidewayFixedTpDistance: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} /></Grid>\n          </Grid>`,
  "Fixed TP form controls",
);

page = replaceOnce(
  page,
  `onClick={() => saveLotSettings.mutate({ trendFixedLot, sidewayRiskPercent, sidewayMaxLot })}`,
  `onClick={() => saveLotSettings.mutate({\n              trendFixedLot,\n              sidewayRiskPercent,\n              sidewayMaxLot,\n              trendFixedTpEnabled,\n              trendFixedTpDistance,\n              sidewayFixedTpEnabled,\n              sidewayFixedTpDistance,\n            })}`,
  "seven-field settings save",
);

page = replaceOnce(
  page,
  `<Typography variant="caption" color="text.secondary">Chỉ lưu khi Mode PAUSE, MT5 DEMO kết nối và không có vị thế XAUUSD.</Typography>`,
  `<Typography variant="caption" color="text.secondary">Chỉ lưu khi Mode PAUSE, MT5 DEMO/LIVE khớp account mode canonical và không có vị thế XAUUSD · NEW_POSITIONS_ONLY.</Typography>`,
  "account-aware settings save notice",
);

write(files.route, route);
write(files.types, types);
write(files.api, api);
write(files.page, page);
console.log("FIXED_TP_API_WEB_PATCH=APPLIED");
