import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import {
  createPhase7CLiveArmPreflight,
  enablePhase7CAuto,
  executePhase7CLiveArmAction,
  getPhase7CAutoActivationStatus,
  getPhase7CLiveArmControlCapability,
  getPhase7CLiveArmControlStatus,
  type Phase7CLiveArmAction,
} from "../phase7c-execution-control";

const CHECK_LABELS: Record<string, string> = {
  controlEnabled: "Local Web control enabled",
  accountStateValid: "Tài khoản hợp lệ",
  botPaused: "Bot đang Tạm dừng",
  runtimeReady: "Executors + Telegram + lot profile Sẵn sàng",
  bridgeReachable: "MT5 Bridge kết nối",
  bridgeMatchesSelectedAccount: "Bridge khớp account đã chọn",
  brokerIsReal: "Broker account là LIVE/REAL",
  tradingEnabled: "Bridge trading enabled",
  terminalTradeAllowed: "MT5 terminal cho phép trading",
  expertTradeAllowed: "MT5 Algo/Expert Trading bật",
  zeroXauusdPositions: "XAUUSD positions = 0",
  bridgeSessionAvailable: "Bridge session hợp lệ",
  currentlyDisarmed: "LIVE hiện DISARMED",
  currentlyArmed: "LIVE hiện ARMED",
  noControlRunning: "Không có ARM request khác đang chạy",
  selectedLiveAccount: "Account đang chọn là LIVE",
  liveArmSatisfied: "LIVE ARM đạt hoặc DEMO không cần ARM",
};

function checkCount(checks: Record<string, boolean> | undefined) {
  const entries = Object.entries(checks ?? {});
  return {
    passed: entries.filter(([, value]) => value).length,
    total: entries.length,
    entries,
  };
}

function CheckRows({ entries }: { entries: Array<[string, boolean]> }) {
  return (
    <Stack spacing={0.65}>
      {entries.map(([key, passed]) => (
        <Stack key={key} direction="row" justifyContent="space-between" gap={2}>
          <Typography variant="body2" color="text.secondary">
            {CHECK_LABELS[key] ?? key}
          </Typography>
          <Typography variant="body2" fontWeight={900} color={passed ? "success.main" : "error.main"}>
            {passed ? "Đạt" : "BLOCK"}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function Phase7CExecutionAuthorizationCard() {
  const queryClient = useQueryClient();
  const [armRequestId, setArmRequestId] = useState<string | null>(null);
  const [showArmChecks, setShowArmChecks] = useState(false);
  const [showAutoChecks, setShowAutoChecks] = useState(false);

  const capability = useQuery({
    queryKey: ["phase7c-live-arm-control-capability"],
    queryFn: getPhase7CLiveArmControlCapability,
    refetchInterval: armRequestId ? false : 3_000,
    retry: false,
  });

  const autoStatus = useQuery({
    queryKey: ["phase7c-auto-activation-status"],
    queryFn: getPhase7CAutoActivationStatus,
    refetchInterval: 3_000,
    retry: false,
  });

  const armMutation = useMutation({
    mutationFn: async (action: Phase7CLiveArmAction) => {
      const preflight = await createPhase7CLiveArmPreflight(action);
      if (!preflight.approved || !preflight.preflightToken) {
        throw new Error(
          `${action === "ARM_LIVE" ? "ARM LIVE" : "DISARM LIVE"} bị khóa: ` +
          `${preflight.blockedBy.join(", ") || "UNKNOWN"}.`,
        );
      }
      const message = action === "ARM_LIVE"
        ? "Xác nhận ARM tài khoản LIVE cho đúng bridge session hiện tại? Bot phải đang PAUSE; thao tác này không tự bật AUTO và không gửi order."
        : "Xác nhận DISARM LIVE? Thao tác này thu hồi quyền mở lệnh mới và không đóng vị thế đang có.";
      if (!window.confirm(message)) throw new Error("Đã hủy thao tác theo yêu cầu người vận hành.");
      return executePhase7CLiveArmAction(action, preflight.preflightToken);
    },
    onSuccess: (result) => setArmRequestId(result.requestId),
  });

  const armStatus = useQuery({
    queryKey: ["phase7c-live-arm-control-status", armRequestId],
    queryFn: () => getPhase7CLiveArmControlStatus(armRequestId ?? ""),
    enabled: Boolean(armRequestId),
    refetchInterval: (query) => {
      const state = query.state.data;
      return state?.status === "PASS" || state?.status === "FAIL" ? false : 1_500;
    },
    retry: false,
  });

  const autoMutation = useMutation({
    mutationFn: enablePhase7CAuto,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["phase7c-auto-activation-status"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-lifecycle"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-decision-monitor"] }),
      ]);
    },
  });

  const controlDone = armStatus.data?.status === "PASS" || armStatus.data?.status === "FAIL";
  if (controlDone && capability.data && armRequestId) {
    queueMicrotask(() => {
      setArmRequestId(null);
      void queryClient.invalidateQueries({ queryKey: ["phase7c-live-arm-control-capability"] });
      void queryClient.invalidateQueries({ queryKey: ["phase7c-auto-activation-status"] });
      void queryClient.invalidateQueries({ queryKey: ["phase7c-lifecycle"] });
    });
  }

  const accountMode = capability.data?.accountMode ?? autoStatus.data?.accountMode ?? "DEMO";
  const botMode = autoStatus.data?.botMode ?? capability.data?.botMode ?? "—";
  const armed = capability.data?.liveExecutionArmed === true;
  const canAttemptAuto = botMode !== "AUTO" && !autoMutation.isPending;
  const armCount = checkCount(capability.data?.armChecks);
  const autoCount = checkCount(autoStatus.data?.checks);
  const bridgeSession = capability.data?.bridgeSessionId ?? "—";
  const positions = capability.data?.openXauusdPositions ?? 0;

  return (
    <Card variant="outlined" sx={{ borderRadius: 4, borderColor: accountMode === "LIVE" ? "warning.main" : "success.main" }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Typography variant="overline" color={accountMode === "LIVE" ? "warning.main" : "success.main"} fontWeight={950}>
              EXECUTION AUTHORIZATION
            </Typography>
            <Typography variant="h6" fontWeight={950}>Ủy quyền giao dịch</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.4}>
              ARM chỉ dành cho LIVE. AUTO luôn qua backend safety guard và không có đường bypass.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <Chip label={`ACCOUNT ${accountMode}`} color={accountMode === "LIVE" ? "warning" : "success"} sx={{ fontWeight: 950 }} />
            <Chip label={`BOT ${botMode}`} variant="outlined" sx={{ fontWeight: 950 }} />
            <Chip
              label={accountMode === "DEMO" ? "DEMO · ARM KHÔNG YÊU CẦU" : armed ? "LIVE · ARMED" : "LIVE · DISARMED"}
              color={accountMode === "DEMO" || armed ? "success" : "error"}
              variant={accountMode === "DEMO" || armed ? "filled" : "outlined"}
              sx={{ fontWeight: 950 }}
            />
          </Stack>
        </Stack>

        {capability.isError ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            Không đọc được LIVE ARM capability: {capability.error instanceof Error ? capability.error.message : "UNKNOWN"}
          </Alert>
        ) : null}
        {autoStatus.isError ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            Không đọc được AUTO status: {autoStatus.error instanceof Error ? autoStatus.error.message : "UNKNOWN"}
          </Alert>
        ) : null}
        {accountMode === "LIVE" && capability.data && !capability.data.taskInstalled ? (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            Elevated LIVE ARM task chưa được đăng ký. Cần cài một lần bằng PowerShell Administrator.
          </Alert>
        ) : null}

        {accountMode === "LIVE" ? (
          <Box mt={1.8} sx={{ p: 1.6, borderRadius: 3, bgcolor: "rgba(15,23,42,.28)", border: "1px solid rgba(148,163,184,.14)" }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.2}>
              <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                <Chip label={armed ? "ARMED" : "DISARMED"} color={armed ? "success" : "error"} size="small" sx={{ fontWeight: 950 }} />
                <Chip label={`XAUUSD positions ${positions}`} size="small" variant="outlined" />
                <Chip label={`Session ${bridgeSession}`} size="small" variant="outlined" />
                <Chip
                  label={armed ? "Điều kiện ARM: đã ARMED" : `Điều kiện ARM: ${armCount.passed}/${armCount.total} đạt`}
                  color={!armed && capability.data?.canArm ? "success" : "default"}
                  size="small"
                  variant="outlined"
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowArmChecks((value) => !value)}
                  sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
                >
                  {showArmChecks ? "ẨN ĐIỀU KIỆN ARM" : "KIỂM TRA ĐIỀU KIỆN ARM"}
                </Button>
                <Button
                  size="small"
                  variant={armed ? "outlined" : "contained"}
                  color={armed ? "error" : "success"}
                  disabled={armMutation.isPending || Boolean(armRequestId) || !capability.data?.taskInstalled}
                  onClick={() => armMutation.mutate(armed ? "DISARM_LIVE" : "ARM_LIVE")}
                  sx={{ fontWeight: 950, whiteSpace: "nowrap" }}
                >
                  {armMutation.isPending ? "ĐANG XỬ LÝ..." : armed ? "DISARM LIVE" : "ARM LIVE"}
                </Button>
              </Stack>
            </Stack>

            {showArmChecks ? (
              <Box mt={1.4} pt={1.3} sx={{ borderTop: "1px solid rgba(148,163,184,.14)" }}>
                <CheckRows entries={armCount.entries} />
                {capability.data?.armBlockedBy?.length ? (
                  <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1 }}>
                    ARM đang khóa bởi: {capability.data.armBlockedBy.join(" · ")}.
                  </Typography>
                ) : null}
              </Box>
            ) : null}
          </Box>
        ) : (
          <Alert severity="success" sx={{ mt: 1.8 }}>
            DEMO · ARM KHÔNG YÊU CẦU. Chỉ cần Bot đạt Sẵn sàng rồi bật AUTO.
          </Alert>
        )}

        <Box mt={1.6} sx={{ p: 1.6, borderRadius: 3, bgcolor: "rgba(15,23,42,.28)", border: "1px solid rgba(148,163,184,.14)" }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.2}>
            <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography fontWeight={950}>AUTO</Typography>
              <Chip
                label={autoStatus.data?.approved ? "READY" : "BLOCKED"}
                color={autoStatus.data?.approved ? "success" : "warning"}
                size="small"
                sx={{ fontWeight: 950 }}
              />
              <Chip label={`${autoCount.passed}/${autoCount.total} điều kiện đạt`} size="small" variant="outlined" />
              {autoStatus.data?.blockedBy?.length ? (
                <Typography variant="caption" color="warning.main">
                  Khóa bởi: {autoStatus.data.blockedBy.join(" · ")}
                </Typography>
              ) : null}
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowAutoChecks((value) => !value)}
                sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
              >
                {showAutoChecks ? "ẨN CHI TIẾT AUTO" : "CHI TIẾT AUTO"}
              </Button>
              <Button
                variant="contained"
                color="primary"
                disabled={!canAttemptAuto}
                onClick={() => autoMutation.mutate()}
                sx={{ fontWeight: 950, minWidth: 170 }}
              >
                {autoMutation.isPending
                  ? "ĐANG KIỂM TRA..."
                  : accountMode === "DEMO"
                    ? "BẬT AUTO DEMO"
                    : "BẬT AUTO LIVE"}
              </Button>
            </Stack>
          </Stack>

          {showAutoChecks ? (
            <Box mt={1.4} pt={1.3} sx={{ borderTop: "1px solid rgba(148,163,184,.14)" }}>
              <CheckRows entries={autoCount.entries} />
            </Box>
          ) : null}
        </Box>

        {armMutation.error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {armMutation.error instanceof Error ? armMutation.error.message : "ARM/DISARM bị từ chối."}
          </Alert>
        ) : null}
        {armStatus.data ? (
          <Alert severity={armStatus.data.status === "PASS" ? "success" : armStatus.data.status === "FAIL" ? "error" : "info"} sx={{ mt: 1.5 }}>
            {armStatus.data.action} · {armStatus.data.status} · {armStatus.data.phase} · {armStatus.data.message} · ARM {armStatus.data.finalArmStatus}
          </Alert>
        ) : null}
        {autoMutation.isSuccess ? (
          <Alert severity="success" sx={{ mt: 1.5 }}>
            AUTO đã bật qua guarded backend · source {autoMutation.data.state.updatedBy}.
          </Alert>
        ) : null}
        {autoMutation.error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {autoMutation.error instanceof Error ? autoMutation.error.message : "AUTO bị từ chối."}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
