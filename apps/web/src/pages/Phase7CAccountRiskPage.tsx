import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Phase7BOpsPage } from "./Phase7BOpsPage";
import { getPhase7CSameModeAccountChangeReadiness } from "../phase7c-account-switch-api";
import { maskMt5AccountLogin } from "../phase7c-account-switch";
import { getPhase7CLiveArmControlCapability } from "../phase7c-execution-control";
import { Phase7CAccountSwitchCard } from "../ui/Phase7CAccountSwitchCard";
import { Phase7COperatorStatusBar } from "../ui/Phase7COperatorStatusBar";
import { Phase7CRiskConfigurationCard } from "../ui/Phase7CRiskConfigurationCard";
import { Phase7CStrategyEntryConditionsCard } from "../ui/Phase7CStrategyEntryConditionsCard";

const READINESS_LABELS: Record<string, string> = {
  accountStateValid: "Account state hợp lệ",
  botPaused: "Bot đang PAUSE",
  runtimeReady: "Runtime đang READY",
  bridgeMatchesSelectedAccount: "Bridge khớp tài khoản",
  zeroXauusdPositions: "XAUUSD positions = 0",
  noTrendManagedTicket: "Trend không giữ managed ticket",
  noSidewayManagedTicket: "Sideway không giữ managed ticket",
  noTrendPendingPullback: "Trend không có pending pullback",
  noSidewayPendingEntry: "Sideway không có pending entry",
  noExecutionLock: "Không có execution lock",
  liveDisarmed: "LIVE đang DISARMED",
  noSwitchRunning: "Không có account switch đang chạy",
};

function ReadinessRow({ label, passed }: { label: string; passed: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.55}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={950} color={passed ? "success.main" : "error.main"}>
        {passed ? "✓" : "✕"}
      </Typography>
    </Stack>
  );
}

export function Phase7CAccountRiskPage() {
  const [accountSwitchOpen, setAccountSwitchOpen] = useState(false);
  const [riskEditorOpen, setRiskEditorOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const readinessQuery = useQuery({
    queryKey: ["phase7c-same-mode-account-change-readiness"],
    queryFn: getPhase7CSameModeAccountChangeReadiness,
    refetchInterval: 2_000,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const armQuery = useQuery({
    queryKey: ["phase7c-live-arm-control-capability"],
    queryFn: getPhase7CLiveArmControlCapability,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  const readiness = readinessQuery.data;
  const checks = readiness?.checks;
  const safeToSwitch = readiness?.approved === true;
  const firstBlocked = useMemo(
    () => Object.entries(checks ?? {}).find(([, passed]) => passed === false) ?? null,
    [checks],
  );
  const blockedReason = firstBlocked
    ? READINESS_LABELS[firstBlocked[0]] ?? firstBlocked[0]
    : readinessQuery.isError
      ? "Không đọc được readiness"
      : "Đang chờ dữ liệu readiness";

  const accountMode = readiness?.currentMode ?? armQuery.data?.accountMode ?? "—";
  const login = readiness?.accountLogin ?? null;
  const server = readiness?.server ?? "—";
  const botMode = readiness?.currentBotMode ?? armQuery.data?.botMode ?? "—";
  const liveDisarmed = accountMode !== "LIVE" || armQuery.data?.liveExecutionArmed !== true;
  const pendingEntriesClear = checks?.noTrendPendingPullback === true && checks?.noSidewayPendingEntry === true;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="primary" fontWeight={950}>ACCOUNT & RISK V2</Typography>
        <Typography variant="h4" fontWeight={950}>Tài khoản & Rủi ro</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.6}>
          Tập trung vào tài khoản đang kết nối, readiness đổi tài khoản và cấu hình rủi ro cho lệnh mới. Chi tiết chiến lược và chẩn đoán kỹ thuật được thu gọn khi không cần dùng.
        </Typography>
      </Box>

      <Phase7COperatorStatusBar />

      <Card
        variant="outlined"
        sx={{
          borderRadius: 4,
          borderColor: safeToSwitch ? "success.main" : "warning.main",
          bgcolor: safeToSwitch ? "rgba(34,197,94,.05)" : "rgba(245,158,11,.05)",
        }}
      >
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="overline" color={safeToSwitch ? "success.main" : "warning.main"} fontWeight={950}>
                {safeToSwitch ? "AN TOÀN ĐỂ ĐỔI TÀI KHOẢN" : "CHƯA THỂ ĐỔI TÀI KHOẢN"}
              </Typography>
              <Typography variant="h6" fontWeight={950}>
                {safeToSwitch ? "Các guard đổi tài khoản đang đạt." : `Blocker hiện tại: ${blockedReason}`}
              </Typography>
              {!safeToSwitch ? (
                <Typography variant="body2" color="text.secondary" mt={0.6}>
                  Hành động cần làm: xử lý blocker ở trên trước khi mở guarded account switch.
                </Typography>
              ) : null}
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignContent="flex-start">
              <Chip label={`BOT ${botMode}`} color={botMode === "PAUSE" ? "success" : "warning"} variant="outlined" />
              <Chip label={liveDisarmed ? "DISARMED" : "ARMED"} color={liveDisarmed ? "success" : "warning"} variant="outlined" />
              <Chip label={`POSITIONS ${readiness?.openXauusdPositions ?? "—"}`} color={readiness?.openXauusdPositions === 0 ? "success" : "warning"} variant="outlined" />
              <Chip label={pendingEntriesClear ? "PENDING NONE" : "PENDING CHECK"} color={pendingEntriesClear ? "success" : "warning"} variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 4, height: "100%" }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack direction="row" justifyContent="space-between" gap={2} alignItems="flex-start">
                <Box>
                  <Typography variant="overline" color="warning.main" fontWeight={950}>TÀI KHOẢN MT5</Typography>
                  <Typography variant="h5" fontWeight={950}>{accountMode} · {login ? maskMt5AccountLogin(login) : "LOGIN —"}</Typography>
                  <Typography variant="body2" color="text.secondary" mt={0.5}>{server}</Typography>
                </Box>
                <Chip label={safeToSwitch ? "READY" : "BLOCKED"} color={safeToSwitch ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 900 }} />
              </Stack>

              {readinessQuery.isError ? <Alert severity="error" sx={{ mt: 2 }}>Không đọc được readiness đổi tài khoản.</Alert> : null}

              <Box mt={1.5}>
                <ReadinessRow label="Bot PAUSE" passed={checks?.botPaused === true} />
                <ReadinessRow label="XAUUSD flat" passed={checks?.zeroXauusdPositions === true} />
                <ReadinessRow label="Bridge đúng tài khoản" passed={checks?.bridgeMatchesSelectedAccount === true} />
                <ReadinessRow label="Không có switch đang chạy" passed={checks?.noSwitchRunning === true} />
                {accountMode === "LIVE" ? <ReadinessRow label="LIVE DISARMED" passed={checks?.liveDisarmed === true} /> : null}
              </Box>

              <Button
                variant={accountSwitchOpen ? "outlined" : "contained"}
                color="warning"
                onClick={() => setAccountSwitchOpen((value) => !value)}
                sx={{ mt: 2, fontWeight: 950 }}
              >
                {accountSwitchOpen ? "ẨN ĐỔI TÀI KHOẢN" : "ĐỔI TÀI KHOẢN"}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }} aria-label="CẤU HÌNH RỦI RO · Chỉnh cấu hình">
          <Phase7CRiskConfigurationCard
            editorOpen={riskEditorOpen}
            onToggleEditor={() => setRiskEditorOpen((value) => !value)}
          />
          <Typography variant="caption" color="text.secondary" display="block" mt={0.75} px={0.5}>
            Fixed TP: xem tại Trung tâm điều khiển
          </Typography>
        </Grid>
      </Grid>

      {accountSwitchOpen ? <Phase7CAccountSwitchCard /> : null}

      <Card variant="outlined" sx={{ borderRadius: 4 }}>
        <CardContent sx={{ py: 1.5, px: { xs: 2, md: 2.5 }, "&:last-child": { pb: 1.5 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
            <Box>
              <Typography fontWeight={950}>ĐIỀU KIỆN VÀO LỆNH</Typography>
              <Typography variant="body2" color="text.secondary">Trend · Sideway · Regime · canonical entry conditions</Typography>
            </Box>
            <Button variant="text" onClick={() => setStrategyOpen((value) => !value)} sx={{ fontWeight: 900 }}>
              {strategyOpen ? "Ẩn" : "Mở"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {strategyOpen ? <Phase7CStrategyEntryConditionsCard /> : null}

      <Card variant="outlined" sx={{ borderRadius: 4 }}>
        <CardContent sx={{ py: 1.5, px: { xs: 2, md: 2.5 }, "&:last-child": { pb: 1.5 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
            <Box>
              <Typography fontWeight={950}>CHẨN ĐOÁN / NÂNG CAO</Typography>
              <Typography variant="body2" color="text.secondary">Phase7B Ops · broker spec · runtime · telemetry · safety details</Typography>
            </Box>
            <Button variant="text" onClick={() => setAdvancedOpen((value) => !value)} sx={{ fontWeight: 900 }}>
              {advancedOpen ? "Ẩn" : "Mở"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {advancedOpen ? <Phase7BOpsPage key="advanced-diagnostics" /> : null}
    </Stack>
  );
}
