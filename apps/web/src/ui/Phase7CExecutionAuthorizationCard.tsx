import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
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
  accountStateValid: "Account state hợp lệ",
  botPaused: "Bot đang PAUSE",
  runtimeReady: "Executors + Telegram + lot profile READY",
  bridgeReachable: "MT5 Bridge kết nối",
  bridgeMatchesSelectedAccount: "Bridge khớp account đã chọn",
  brokerIsReal: "Broker account là REAL",
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

export function Phase7CExecutionAuthorizationCard() {
  const queryClient = useQueryClient();
  const [armRequestId, setArmRequestId] = useState<string | null>(null);

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
  const autoChecks = Object.entries(autoStatus.data?.checks ?? {});

  return (
    <Card variant="outlined" sx={{ borderRadius: 4, borderColor: accountMode === "LIVE" ? "warning.main" : "success.main" }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline" color={accountMode === "LIVE" ? "warning.main" : "success.main"} fontWeight={950}>
              EXECUTION AUTHORIZATION
            </Typography>
            <Typography variant="h5" fontWeight={950}>ARM LIVE / AUTO DEMO-LIVE bằng nút Web</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.8}>
              DEMO không cần ARM. LIVE chỉ ARM qua elevated guarded task và canonical arm script. AUTO luôn được backend kiểm tra lại trước khi đổi mode.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <Chip label={`ACCOUNT ${accountMode}`} color={accountMode === "LIVE" ? "warning" : "success"} sx={{ fontWeight: 950 }} />
            <Chip label={`BOT ${botMode}`} variant="outlined" sx={{ fontWeight: 950 }} />
            <Chip
              label={accountMode === "DEMO" ? "ARM NOT REQUIRED" : armed ? "LIVE ARMED" : "LIVE DISARMED"}
              color={accountMode === "DEMO" || armed ? "success" : "error"}
              variant={accountMode === "DEMO" || armed ? "filled" : "outlined"}
              sx={{ fontWeight: 950 }}
            />
          </Stack>
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        {capability.isError ? <Alert severity="error" sx={{ mb: 2 }}>Không đọc được LIVE ARM capability: {capability.error instanceof Error ? capability.error.message : "UNKNOWN"}</Alert> : null}
        {autoStatus.isError ? <Alert severity="error" sx={{ mb: 2 }}>Không đọc được AUTO status: {autoStatus.error instanceof Error ? autoStatus.error.message : "UNKNOWN"}</Alert> : null}
        {accountMode === "LIVE" && capability.data && !capability.data.taskInstalled ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Elevated LIVE ARM task chưa được đăng ký. Cần cài một lần bằng PowerShell Administrator; sau đó ARM/DISARM chỉ dùng nút Web.
          </Alert>
        ) : null}

        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          {accountMode === "LIVE" ? (
            <>
              <Button
                fullWidth
                variant="contained"
                color="success"
                disabled={armMutation.isPending || Boolean(armRequestId) || armed || !capability.data?.taskInstalled}
                onClick={() => armMutation.mutate("ARM_LIVE")}
                sx={{ fontWeight: 950 }}
              >
                {armMutation.isPending && armMutation.variables === "ARM_LIVE" ? "ĐANG ARM..." : "ARM LIVE"}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                color="error"
                disabled={armMutation.isPending || Boolean(armRequestId) || !armed || !capability.data?.taskInstalled}
                onClick={() => armMutation.mutate("DISARM_LIVE")}
                sx={{ fontWeight: 950 }}
              >
                {armMutation.isPending && armMutation.variables === "DISARM_LIVE" ? "ĐANG DISARM..." : "DISARM LIVE"}
              </Button>
            </>
          ) : (
            <Alert severity="success" sx={{ width: "100%" }}>
              DEMO không yêu cầu ARM. Khi bot đang PAUSE, hãy dùng nút AUTO bên cạnh; backend sẽ kiểm tra runtime/Telegram/MT5 trước khi cho phép.
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            color="primary"
            disabled={!canAttemptAuto}
            onClick={() => autoMutation.mutate()}
            sx={{ fontWeight: 950, minHeight: 48 }}
          >
            {autoMutation.isPending
              ? "ĐANG KIỂM TRA AUTO..."
              : accountMode === "DEMO"
                ? "BẬT AUTO DEMO"
                : "BẬT AUTO LIVE"}
          </Button>
        </Stack>

        {armMutation.error ? <Alert severity="error" sx={{ mt: 2 }}>{armMutation.error instanceof Error ? armMutation.error.message : "ARM/DISARM bị từ chối."}</Alert> : null}
        {armStatus.data ? (
          <Alert severity={armStatus.data.status === "PASS" ? "success" : armStatus.data.status === "FAIL" ? "error" : "info"} sx={{ mt: 2 }}>
            {armStatus.data.action} · {armStatus.data.status} · {armStatus.data.phase} · {armStatus.data.message} · ARM {armStatus.data.finalArmStatus}
          </Alert>
        ) : null}
        {autoMutation.isSuccess ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            AUTO đã bật qua guarded backend · source {autoMutation.data.state.updatedBy}.
          </Alert>
        ) : null}
        {autoMutation.error ? <Alert severity="error" sx={{ mt: 2 }}>{autoMutation.error instanceof Error ? autoMutation.error.message : "AUTO bị từ chối."}</Alert> : null}

        <Box mt={2.5} sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(15,23,42,.35)", border: "1px solid rgba(148,163,184,.14)" }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={1.2}>
            <Typography fontWeight={950}>AUTO safety gates</Typography>
            <Chip
              label={autoStatus.data?.approved ? "AUTO READY" : "AUTO BLOCKED"}
              color={autoStatus.data?.approved ? "success" : "warning"}
              size="small"
              sx={{ fontWeight: 950 }}
            />
          </Stack>
          <Stack spacing={0.7}>
            {autoChecks.map(([key, passed]) => (
              <Stack key={key} direction="row" justifyContent="space-between" gap={2}>
                <Typography variant="body2" color="text.secondary">{CHECK_LABELS[key] ?? key}</Typography>
                <Typography variant="body2" fontWeight={900} color={passed ? "success.main" : "error.main"}>{passed ? "PASS" : "BLOCK"}</Typography>
              </Stack>
            ))}
          </Stack>
          {autoStatus.data?.blockedBy?.length ? (
            <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1.2 }}>
              Đang khóa bởi: {autoStatus.data.blockedBy.join(" · ")}. Nút AUTO vẫn bấm được để backend trả lỗi canonical; không có đường bypass.
            </Typography>
          ) : null}
        </Box>
      </CardContent>
    </Card>
  );
}
