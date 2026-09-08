import { useMemo, useState, type ReactNode } from "react";
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
import { getPhase7CSameModeAccountChangeReadiness } from "../phase7c-account-switch-api";
import { maskMt5AccountLogin } from "../phase7c-account-switch";
import { Phase7CAccountRiskAdvancedPanel } from "../ui/Phase7CAccountRiskAdvancedPanel";
import { Phase7CAccountRiskLotCard } from "../ui/Phase7CAccountRiskLotCard";
import { Phase7CAccountSwitchCard } from "../ui/Phase7CAccountSwitchCard";
import { Phase7COperatorStatusBar } from "../ui/Phase7COperatorStatusBar";
import { Phase7CStrategyEntryConditionsCard } from "../ui/Phase7CStrategyEntryConditionsCard";

const READINESS_LABELS: Record<string, string> = {
  botPaused: "Bot đang PAUSE",
  zeroXauusdPositions: "XAUUSD positions = 0",
  bridgeMatchesSelectedAccount: "Bridge đúng tài khoản",
  liveDisarmed: "LIVE đã DISARMED",
  noSwitchRunning: "Không có account switch đang chạy",
};

function SafetyChip({ label, passed }: { label: string; passed: boolean }) {
  return (
    <Chip
      size="small"
      label={`${passed ? "✓" : "✕"} ${label}`}
      color={passed ? "success" : "error"}
      variant="outlined"
      sx={{ fontWeight: 850 }}
    />
  );
}

function DisclosureSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
          <Box>
            <Typography variant="overline" color="primary" fontWeight={950}>{title}</Typography>
            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
          </Box>
          <Button variant="text" size="small" onClick={onToggle} sx={{ fontWeight: 900, alignSelf: { xs: "flex-start", md: "center" } }}>
            {open ? "Ẩn" : "Mở"}
          </Button>
        </Stack>
        {open ? <Box mt={2}>{children}</Box> : null}
      </CardContent>
    </Card>
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

  const readiness = readinessQuery.data;
  const checks = readiness?.checks;
  const switchSafe = readiness?.approved === true;
  const currentMode = readiness?.currentMode ?? "—";
  const login = readiness?.accountLogin ?? null;
  const server = readiness?.server ?? "MT5 server —";

  const safetyRows = useMemo(
    () => [
      ["botPaused", checks?.botPaused === true],
      ["zeroXauusdPositions", checks?.zeroXauusdPositions === true],
      ["bridgeMatchesSelectedAccount", checks?.bridgeMatchesSelectedAccount === true],
      ["liveDisarmed", currentMode === "LIVE" ? checks?.liveDisarmed === true : true],
      ["noSwitchRunning", checks?.noSwitchRunning === true],
    ] as const,
    [checks, currentMode],
  );

  const firstBlocked = safetyRows.find(([, passed]) => !passed)?.[0] ?? null;
  const blockedReason = firstBlocked ? READINESS_LABELS[firstBlocked] ?? firstBlocked : "Đang chờ readiness";

  return (
    <Stack spacing={2.2}>
      <Box
        sx={{
          p: { xs: 2, md: 2.5 },
          borderRadius: 4,
          border: "1px solid rgba(148,163,184,.14)",
          bgcolor: "rgba(15,23,42,.40)",
        }}
      >
        <Typography variant="overline" color="primary" fontWeight={950}>ACCOUNT & RISK V2</Typography>
        <Typography variant="h4" fontWeight={950}>Tài khoản & Rủi ro</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.6}>
          Theo dõi tài khoản, safety gate và cấu hình rủi ro cho lệnh mới. Các chi tiết kỹ thuật chỉ mở khi cần.
        </Typography>
      </Box>

      <Phase7COperatorStatusBar />

      {readinessQuery.isError ? (
        <Alert severity="warning">
          Không đọc được readiness đổi tài khoản: {readinessQuery.error instanceof Error ? readinessQuery.error.message : "lỗi không xác định"}
        </Alert>
      ) : (
        <Alert severity={switchSafe ? "success" : "warning"}>
          <Stack spacing={1}>
            <Typography fontWeight={950}>
              {switchSafe ? "AN TOÀN ĐỂ ĐỔI TÀI KHOẢN" : "CHƯA THỂ ĐỔI TÀI KHOẢN"}
            </Typography>
            {!switchSafe ? (
              <Typography variant="body2">Hành động cần làm: {blockedReason}.</Typography>
            ) : null}
            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
              {safetyRows.map(([key, passed]) => (
                <SafetyChip key={key} label={READINESS_LABELS[key] ?? key} passed={passed} />
              ))}
            </Stack>
          </Stack>
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 4, height: "100%" }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5}>
                <Box>
                  <Typography variant="overline" color="warning.main" fontWeight={950}>TÀI KHOẢN MT5</Typography>
                  <Typography variant="h5" fontWeight={950}>{currentMode}</Typography>
                  <Typography variant="body2" color="text.secondary" mt={0.5}>
                    {login ? maskMt5AccountLogin(login) : "LOGIN —"} · {server}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" alignContent="flex-start">
                  <Chip size="small" label={checks?.bridgeMatchesSelectedAccount ? "BRIDGE OK" : "BRIDGE CHECK"} color={checks?.bridgeMatchesSelectedAccount ? "success" : "warning"} variant="outlined" />
                  <Chip size="small" label={checks?.noSwitchRunning ? "NO SWITCH RUNNING" : "SWITCH BUSY"} color={checks?.noSwitchRunning ? "success" : "warning"} variant="outlined" />
                </Stack>
              </Stack>

              <Stack spacing={0.7} mt={2}>
                {safetyRows.slice(0, 5).map(([key, passed]) => (
                  <Stack key={key} direction="row" justifyContent="space-between" gap={2}>
                    <Typography variant="body2" color="text.secondary">{READINESS_LABELS[key] ?? key}</Typography>
                    <Typography variant="body2" fontWeight={900} color={passed ? "success.main" : "warning.main"}>
                      {passed ? "PASS" : "BLOCK"}
                    </Typography>
                  </Stack>
                ))}
              </Stack>

              <Button
                variant={accountSwitchOpen ? "outlined" : "contained"}
                onClick={() => setAccountSwitchOpen((value) => !value)}
                sx={{ mt: 2, fontWeight: 950 }}
              >
                {accountSwitchOpen ? "ẨN ĐỔI TÀI KHOẢN" : "ĐỔI TÀI KHOẢN"}
              </Button>

              {accountSwitchOpen ? (
                <Box mt={2}>
                  <Phase7CAccountSwitchCard />
                </Box>
              ) : null}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Phase7CAccountRiskLotCard
            editorOpen={riskEditorOpen}
            onToggleEditor={() => setRiskEditorOpen((value) => !value)}
          />
        </Grid>
      </Grid>

      <DisclosureSection
        title="ĐIỀU KIỆN VÀO LỆNH"
        subtitle="Trend · Sideway · Regime · các điều kiện chiến lược. Mặc định thu gọn để ưu tiên vận hành."
        open={strategyOpen}
        onToggle={() => setStrategyOpen((value) => !value)}
      >
        <Phase7CStrategyEntryConditionsCard />
      </DisclosureSection>

      <DisclosureSection
        title="CHẨN ĐOÁN / NÂNG CAO"
        subtitle="Runtime, Bridge, broker spec và telemetry kỹ thuật. Chỉ mở khi cần kiểm tra sâu."
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((value) => !value)}
      >
        <Phase7CAccountRiskAdvancedPanel />
      </DisclosureSection>
    </Stack>
  );
}
