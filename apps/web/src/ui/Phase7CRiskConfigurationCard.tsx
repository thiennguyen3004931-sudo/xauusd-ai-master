import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clean, fetchPhase7CWebStatus, raw, value } from "../phase7c-panel-status";
import { resolveConfiguredLotSettings } from "../phase7c-lot-settings";

type LotInput = {
  trendFixedLot: number;
  sidewayRiskPercent: number;
  sidewayMaxLot: number;
};

type FixedTpSnapshot = {
  trendFixedTpEnabled: boolean;
  trendFixedTpDistance: number;
  sidewayFixedTpEnabled: boolean;
  sidewayFixedTpDistance: number;
};

type LotSettingsMutationInput = LotInput & FixedTpSnapshot;

type Props = {
  editorOpen: boolean;
  onToggleEditor: () => void;
};

const LOT_SETTINGS_URL = "/api/v1/phase7c/lot-settings";
const CONTROL_BASE = "http://127.0.0.1:3711";
const MANAGED_LOT_STEP = 0.03;

function asRecord(input: unknown): Record<string, any> {
  return input && typeof input === "object" ? (input as Record<string, any>) : {};
}

function numberText(input: unknown, fallback = "—") {
  const text = clean(input, "");
  return text || fallback;
}

function clampLotInputs(input: LotInput): LotInput {
  return {
    trendFixedLot: Number(input.trendFixedLot.toFixed(2)),
    sidewayRiskPercent: Number(input.sidewayRiskPercent.toFixed(2)),
    sidewayMaxLot: Number(input.sidewayMaxLot.toFixed(2)),
  };
}

function isManagedLotIncrement(input: number) {
  if (!Number.isFinite(input)) return false;
  const units = input / MANAGED_LOT_STEP;
  return Math.abs(units - Math.round(units)) < 1e-8;
}

function validateLotInput(input: LotInput) {
  const errors: string[] = [];
  if (!Number.isFinite(input.trendFixedLot) || input.trendFixedLot < 0.03 || input.trendFixedLot > 1.2) {
    errors.push("Trend fixed lot phải trong khoảng 0.03–1.20.");
  } else if (!isManagedLotIncrement(input.trendFixedLot)) {
    errors.push("Trend fixed lot phải theo bước 0.03.");
  }
  if (!Number.isFinite(input.sidewayRiskPercent) || input.sidewayRiskPercent < 0.01 || input.sidewayRiskPercent > 1) {
    errors.push("Sideway risk percent phải trong khoảng 0.01–1.00%.");
  }
  if (!Number.isFinite(input.sidewayMaxLot) || input.sidewayMaxLot < 0.03 || input.sidewayMaxLot > 1.2) {
    errors.push("Sideway max lot phải trong khoảng 0.03–1.20.");
  } else if (!isManagedLotIncrement(input.sidewayMaxLot)) {
    errors.push("Sideway max lot phải theo bước 0.03.");
  }
  return errors;
}

function lotEquals(left: LotInput, right: LotInput) {
  return Math.abs(left.trendFixedLot - right.trendFixedLot) < 0.0001
    && Math.abs(left.sidewayRiskPercent - right.sidewayRiskPercent) < 0.0001
    && Math.abs(left.sidewayMaxLot - right.sidewayMaxLot) < 0.0001;
}

async function saveLotSettings(input: LotSettingsMutationInput) {
  const body = JSON.stringify({ ...input, source: "web-account-risk-v6" });
  const errors: string[] = [];

  for (const url of [LOT_SETTINGS_URL, `${CONTROL_BASE}${LOT_SETTINGS_URL}`]) {
    try {
      const response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body,
      });
      const text = await response.text();
      if (response.ok) return text ? JSON.parse(text) : {};
      errors.push(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Không kết nối được");
    }
  }

  throw new Error(errors.join(" | "));
}

function SummaryRow({ label, valueText, strong = false }: { label: string; valueText: string; strong?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.75}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={strong ? 950 : 800} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

export function Phase7CRiskConfigurationCard({ editorOpen, onToggleEditor }: Props) {
  const queryClient = useQueryClient();
  const [trendFixedLot, setTrendFixedLot] = useState("");
  const [sidewayRiskPercent, setSidewayRiskPercent] = useState("");
  const [sidewayMaxLot, setSidewayMaxLot] = useState("");

  const query = useQuery({
    queryKey: ["phase7c-web-status-account-risk-v2-primary"],
    queryFn: fetchPhase7CWebStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  const mutation = useMutation({
    mutationFn: saveLotSettings,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["phase7c-web-status-account-risk-v2-primary"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-web-status-account-risk-v6"] }),
      ]);
    },
  });

  const data = query.data;
  const panel = data?.panel;
  const ui = data?.ui;
  const accountRisk = asRecord(data?.accountRisk);
  const configuration = asRecord(accountRisk.configuration);
  const lifecycle = asRecord(data?.lifecycle);
  const bridge = asRecord(lifecycle.bridge);
  const mode = asRecord(lifecycle.mode);
  const resolvedConfiguredLot = resolveConfiguredLotSettings(data?.lotSettings, configuration);
  const savedLot = resolvedConfiguredLot ? clampLotInputs(resolvedConfiguredLot) : null;
  const fixedTpState = asRecord(asRecord(data?.lotSettings).state);
  const trendFixedTpDistance = Number(fixedTpState.trendFixedTpDistance);
  const sidewayFixedTpDistance = Number(fixedTpState.sidewayFixedTpDistance);
  const canonicalFixedTp: FixedTpSnapshot | null =
    typeof fixedTpState.trendFixedTpEnabled === "boolean"
    && Number.isFinite(trendFixedTpDistance)
    && trendFixedTpDistance >= 0
    && (!fixedTpState.trendFixedTpEnabled || trendFixedTpDistance > 0)
    && typeof fixedTpState.sidewayFixedTpEnabled === "boolean"
    && Number.isFinite(sidewayFixedTpDistance)
    && sidewayFixedTpDistance >= 0
    && (!fixedTpState.sidewayFixedTpEnabled || sidewayFixedTpDistance > 0)
      ? {
          trendFixedTpEnabled: fixedTpState.trendFixedTpEnabled,
          trendFixedTpDistance,
          sidewayFixedTpEnabled: fixedTpState.sidewayFixedTpEnabled,
          sidewayFixedTpDistance,
        }
      : null;

  const activeMode = clean(ui?.mode, clean(mode.mode, value(panel, "activeMode", "—")));
  const openPositions = Number(bridge.openXauusdPositions ?? raw(panel, "positionCount") ?? 0);
  const canSafelyApply = activeMode === "PAUSE" && openPositions === 0;
  const draftLot = clampLotInputs({
    trendFixedLot: Number(trendFixedLot),
    sidewayRiskPercent: Number(sidewayRiskPercent),
    sidewayMaxLot: Number(sidewayMaxLot),
  });
  const validationErrors = validateLotInput(draftLot);
  const hasChanges = savedLot !== null && validationErrors.length === 0 && !lotEquals(savedLot, draftLot);

  useEffect(() => {
    if (!resolvedConfiguredLot) {
      setTrendFixedLot("");
      setSidewayRiskPercent("");
      setSidewayMaxLot("");
      return;
    }
    setTrendFixedLot(numberText(resolvedConfiguredLot.trendFixedLot, ""));
    setSidewayRiskPercent(numberText(resolvedConfiguredLot.sidewayRiskPercent, ""));
    setSidewayMaxLot(numberText(resolvedConfiguredLot.sidewayMaxLot, ""));
  }, [resolvedConfiguredLot?.trendFixedLot, resolvedConfiguredLot?.sidewayRiskPercent, resolvedConfiguredLot?.sidewayMaxLot]);

  const save = () => {
    if (!savedLot || !canonicalFixedTp || !canSafelyApply || validationErrors.length > 0 || !hasChanges || mutation.isPending) return;
    const confirmed = window.confirm(
      `Xác nhận lưu cấu hình rủi ro cho LỆNH MỚI?\n\nTrend: ${savedLot.trendFixedLot.toFixed(2)} → ${draftLot.trendFixedLot.toFixed(2)}\nSideway risk: ${savedLot.sidewayRiskPercent.toFixed(2)}% → ${draftLot.sidewayRiskPercent.toFixed(2)}%\nSideway max lot: ${savedLot.sidewayMaxLot.toFixed(2)} → ${draftLot.sidewayMaxLot.toFixed(2)}\n\nFixed TP canonical được giữ nguyên.`,
    );
    if (confirmed) mutation.mutate({ ...draftLot, ...canonicalFixedTp });
  };

  const reset = () => {
    if (!savedLot) return;
    setTrendFixedLot(savedLot.trendFixedLot.toFixed(2));
    setSidewayRiskPercent(savedLot.sidewayRiskPercent.toFixed(2));
    setSidewayMaxLot(savedLot.sidewayMaxLot.toFixed(2));
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 4, height: "100%" }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
          <Box>
            <Typography variant="overline" color="primary" fontWeight={950}>CẤU HÌNH RỦI RO</Typography>
            <Typography variant="h5" fontWeight={950}>Lot & mức rủi ro cho lệnh mới</Typography>
          </Box>
          <Chip
            label={canSafelyApply ? "SAFETY PASS" : "LOCKED"}
            color={canSafelyApply ? "success" : "warning"}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 900 }}
          />
        </Stack>

        {query.isError && <Alert severity="error" sx={{ mt: 2 }}>Không đọc được cấu hình rủi ro.</Alert>}
        {mutation.isError && <Alert severity="error" sx={{ mt: 2 }}>Không lưu được cấu hình rủi ro: {mutation.error instanceof Error ? mutation.error.message : "lỗi không xác định"}</Alert>}
        {mutation.isSuccess && <Alert severity="success" sx={{ mt: 2 }}>Đã lưu cấu hình rủi ro cho lệnh mới và giữ nguyên Fixed TP canonical.</Alert>}

        <Box mt={1.5}>
          <SummaryRow label="Trend Fixed Lot" valueText={savedLot ? savedLot.trendFixedLot.toFixed(2) : "—"} strong />
          <SummaryRow label="Sideway Risk" valueText={savedLot ? `${savedLot.sidewayRiskPercent.toFixed(2)}%` : "—"} />
          <SummaryRow label="Sideway Max Lot" valueText={savedLot ? savedLot.sidewayMaxLot.toFixed(2) : "—"} />
          <SummaryRow label="Áp dụng" valueText="NEW POSITIONS ONLY" />
          <SummaryRow label="Fixed TP" valueText="xem tại Trung tâm điều khiển" />
        </Box>

        <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
          <Chip label="Không Martingale" size="small" variant="outlined" />
          <Chip label="Không Recovery Lot" size="small" variant="outlined" />
          <Chip label={`BOT ${activeMode}`} size="small" variant="outlined" />
          <Chip label={`POSITIONS ${openPositions}`} size="small" variant="outlined" />
        </Stack>

        <Button variant={editorOpen ? "outlined" : "contained"} onClick={onToggleEditor} sx={{ mt: 2, fontWeight: 900 }}>
          {editorOpen ? "Ẩn chỉnh cấu hình" : "Chỉnh cấu hình"}
        </Button>

        {editorOpen ? (
          <Stack spacing={1.5} mt={2}>
            {!canSafelyApply && (
              <Alert severity="warning">Chỉ cho phép lưu khi BOT_MODE=PAUSE và XAUUSD positions = 0.</Alert>
            )}
            {!canonicalFixedTp && (
              <Alert severity="warning">Chưa đọc được Fixed TP canonical nên khóa lưu để tránh thay đổi ngoài ý muốn.</Alert>
            )}
            {validationErrors.length > 0 && <Alert severity="error">{validationErrors.join(" ")}</Alert>}
            <TextField
              label="Trend fixed lot"
              type="number"
              value={trendFixedLot}
              onChange={(event) => setTrendFixedLot(event.target.value)}
              inputProps={{ min: 0.03, max: 1.2, step: MANAGED_LOT_STEP }}
              fullWidth
            />
            <TextField
              label="Sideway risk percent"
              type="number"
              value={sidewayRiskPercent}
              onChange={(event) => setSidewayRiskPercent(event.target.value)}
              inputProps={{ min: 0.01, max: 1, step: 0.01 }}
              fullWidth
            />
            <TextField
              label="Sideway max lot"
              type="number"
              value={sidewayMaxLot}
              onChange={(event) => setSidewayMaxLot(event.target.value)}
              inputProps={{ min: 0.03, max: 1.2, step: MANAGED_LOT_STEP }}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                variant="contained"
                onClick={save}
                disabled={mutation.isPending || !savedLot || !canonicalFixedTp || !canSafelyApply || validationErrors.length > 0 || !hasChanges}
                sx={{ fontWeight: 900 }}
              >
                {mutation.isPending ? "Đang lưu…" : "Lưu cấu hình"}
              </Button>
              <Button variant="outlined" onClick={reset} disabled={!savedLot || !hasChanges || mutation.isPending}>
                Khôi phục
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Fixed TP: xem tại Trung tâm điều khiển · thao tác này giữ nguyên Fixed TP canonical.
            </Typography>
          </Stack>
        ) : null}
      </CardContent>
    </Card>
  );
}
