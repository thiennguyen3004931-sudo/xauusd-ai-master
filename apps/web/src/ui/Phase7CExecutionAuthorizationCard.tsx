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
  type Phase7CLiveArmPreflight,
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
  liveArmSatisfied: "LIVE ARM đã hợp lệ",
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
  const [armPreflight, setArmPreflight] = useState<Phase7CLiveArmPreflight | null>(null);
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

  const armPreflightMutation = useMutation({
    mutationFn: () => createPhase7CLiveArmPreflight("ARM_LIVE"),
    onMutate: () => setArmPreflight(null),
    onSuccess: (result) => setArmPreflight(result),
  });

  const armMutation = useMutation({
    mutationFn: async (action: Phase7CLiveArmAction) => {
      let preflight: Phase7CLiveArmPreflight;
      if (action === "ARM_LIVE") {
        if (!armPreflight?.approved || !armPreflight.preflightToken) {
          throw new Error("Hãy chạy Kiểm tra điều kiện ARM LIVE và bảo đảm kết quả PASS trước khi ARM.");
        }
        if (
          armPreflight.bridgeSessionId !== capability.data?.bridgeSessionId ||
          (armPreflight.expiresAt !== null && Date.now() >= armPreflight.expiresAt)
        ) {
          throw new Error("Kết quả kiểm tra ARM LIVE đã hết hiệu lực hoặc bridge session đã thay đổi. Hãy kiểm tra lại.");
        }
        preflight = armPreflight;
      } else {
        preflight = await createPhase7CLiveArmPreflight("DISARM_LIVE");
        if (!preflight.approved || !preflight.preflightToken) {
          throw new Error(`DISARM LIVE bị khóa: ${preflight.blockedBy.join(", ") || "UNKNOWN"}.`);
        }
      }

      const message = action === "ARM_LIVE"
        ? "Xác nhận ARM tài khoản LIVE cho đúng bridge session hiện tại? Bot phải đang PAUSE; thao tác này không tự bật AUTO và không gửi order."
        : "Xác nhận DISARM LIVE? Thao tác này thu hồi quyền mở lệnh mới và không đóng vị thế đang có.";
      if (!window.confirm(message)) throw new Error("Đã hủy thao tác theo yêu cầu người vận hành.");
      return executePhase7CLiveArmAction(action, preflight.preflightToken!);
    },
    onSuccess: (result) => {
      setArmRequestId(result.requestId);
      setArmPreflight(null);
    },
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
      setArmPreflight(null);
      void queryClient.invalidateQueries({ queryKey: ["phase7c-live-arm-control-capability"] });
      void queryClient.invalidateQueries({ queryKey: ["phase7c-auto-activation-status"] });
      void queryClient.invalidateQueries({ queryKey: ["phase7c-lifecycle"] });
    });
  }

  const accountMode = capability.data?.accountMode ?? autoStatus.data?.accountMode ?? "DEMO";
  const botMode = autoStatus.data?.botMode ?? capability.data?.botMode ?? "—";
  const isAutoActive = botMode === "AUTO";
  const showAutoActivationDiagnostics = !isAutoActive;
  const autoStatusLabel = isAutoActive
    ? "ĐANG HOẠT ĐỘNG"
    : autoStatus.data?.approved
      ? "READY"
      : "BLOCKED";
  const autoStatusColor = isAutoActive || autoStatus.data?.approved ? "success" : "warning";
  const armed = capability.data?.liveExecutionArmed === true;
  const canAttemptAuto = !isAutoActive && !autoMutation.isPending;
  const armPreflightCount = checkCount(armPreflight?.checks);
  const autoChecks = accountMode === "DEMO"
    ? Object.fromEntries(
        Object.entries(autoStatus.data?.checks ?? {}).filter(([key]) => key !== "liveArmSatisfied"),
      )
    : autoStatus.data?.checks;
  const autoCount = checkCount(autoChecks);
  const autoBlockedBy = (autoStatus.data?.blockedBy ?? []).filter(
    (key) => !(accountMode === "DEMO" && key === "liveArmSatisfied"),
  );
  const bridgeSession = capability.data?.bridgeSessionId ?? "—";
  const positions = capability.data?.openXauusdPositions ?? 0;
  const armPreflightReady = Boolean(
    armPreflight?.approved &&
    armPreflight.preflightToken &&
    armPreflight.bridgeSessionId === capability.data?.bridgeSessionId &&
    (armPreflight.expiresAt === null || Date.now() < armPreflight.expiresAt),
  );

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
              {accountMode === "LIVE"
                ? "ARM LIVE được scope theo bridge session hiện tại; AUTO vẫn qua backend safety guard và không có đường bypass."
                : "DEMO chỉ dùng AUTO safety guard; không có thao tác ủy quyền LIVE."}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <Chip label={`ACCOUNT ${accountMode}`} color={accountMode === "LIVE" ? "warning" : "success"} sx={{ fontWeight: 950 }} />
            <Chip label={`BOT ${botMode}`} variant="outlined" sx={{ fontWeight: 950 }} />
            {accountMode === "LIVE" ? (
              <Chip
                label={armed ? "LIVE · ARMED" : "LIVE · DISARMED"}
                color={armed ? "success" : "error"}
                variant={armed ? "filled" : "outlined"}
                sx={{ fontWeight: 950 }}
              />
            ) : null}
          </Stack>
        </Stack>

        {accountMode === "LIVE" && capability.isError ? (
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
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {!armed ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={
                      armPreflightMutation.isPending ||
                      armMutation.isPending ||
                      Boolean(armRequestId) ||
                      !capability.data?.taskInstalled
                    }
                    onClick={() => armPreflightMutation.mutate()}
                    sx={{ fontWeight: 950, whiteSpace: "nowrap" }}
                  >
                    {armPreflightMutation.isPending ? "ĐANG KIỂM TRA..." : "KIỂM TRA ĐIỀU KIỆN ARM LIVE"}
                  </Button>
                ) : null}
                <Button
                  size="small"
                  variant={armed ? "outlined" : "contained"}
                  color={armed ? "error" : "success"}
                  disabled={
                    armMutation.isPending ||
                    Boolean(armRequestId) ||
                    !capability.data?.taskInstalled ||
                    (!armed && !armPreflightReady)
                  }
                  onClick={() => armMutation.mutate(armed ? "DISARM_LIVE" : "ARM_LIVE")}
                  sx={{ fontWeight: 950, whiteSpace: "nowrap" }}
                >
                  {armMutation.isPending ? "ĐANG XỬ LÝ..." : armed ? "DISARM LIVE" : "ARM LIVE"}
                </Button>
              </Stack>
            </Stack>

            {armPreflight ? (
              <Box mt={1.4} pt={1.3} sx={{ borderTop: "1px solid rgba(148,163,184,.14)" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={1.2}>
                  <Typography fontWeight={950}>Kết quả kiểm tra ARM LIVE</Typography>
                  <Stack direction="row" spacing={0.8}>
                    <Chip
                      label={armPreflight.approved ? "PASS" : "BLOCKED"}
                      color={armPreflight.approved ? "success" : "error"}
                      size="small"
                      sx={{ fontWeight: 950 }}
                    />
                    <Chip label={`${armPreflightCount.passed}/${armPreflightCount.total} đạt`} size="small" variant="outlined" />
                  </Stack>
                </Stack>
                <CheckRows entries={armPreflightCount.entries} />
                {armPreflight.blockedBy.length ? (
                  <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1 }}>
                    ARM đang khóa bởi: {armPreflight.blockedBy.join(" · ")}.
                  </Typography>
                ) : (
                  <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 1 }}>
                    Điều kiện ARM LIVE đã đạt cho bridge session hiện tại. Kết quả có hiệu lực ngắn hạn.
                  </Typography>
                )}
              </Box>
            ) : null}
          </Box>
        ) : null}

        <Box mt={1.6} sx={{ p: 1.6, borderRadius: 3, bgcolor: "rgba(15,23,42,.28)", border: "1px solid rgba(148,163,184,.14)" }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.2}>
            <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography fontWeight={950}>AUTO</Typography>
              <Chip
                label={autoStatusLabel}
                color={autoStatusColor}
                size="small"
                sx={{ fontWeight: 950 }}
              />
              {showAutoActivationDiagnostics ? (
                <Chip label={`${autoCount.passed}/${autoCount.total} điều kiện đạt`} size="small" variant="outlined" />
              ) : null}
              {showAutoActivationDiagnostics && autoBlockedBy.length ? (
                <Typography variant="caption" color="warning.main">
                  Khóa bởi: {autoBlockedBy.join(" · ")}
                </Typography>
              ) : null}
            </Stack>
            <Stack direction="row" spacing={1}>
              {showAutoActivationDiagnostics ? (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowAutoChecks((value) => !value)}
                  sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
                >
                  {showAutoChecks ? "Ẩn chi tiết tự động" : "Chi tiết tự động"}
                </Button>
              ) : null}
              <Button
                variant="contained"
                color="primary"
                disabled={!canAttemptAuto}
                onClick={() => autoMutation.mutate()}
                sx={{ fontWeight: 950, minWidth: 170 }}
              >
                {isAutoActive
                  ? "AUTO ĐANG BẬT"
                  : autoMutation.isPending
                    ? "ĐANG KIỂM TRA..."
                    : accountMode === "DEMO"
                      ? "Bật tự động Demo"
                      : "Bật tự động Live"}
              </Button>
            </Stack>
          </Stack>

          {showAutoActivationDiagnostics && showAutoChecks ? (
            <Box mt={1.4} pt={1.3} sx={{ borderTop: "1px solid rgba(148,163,184,.14)" }}>
              <CheckRows entries={autoCount.entries} />
            </Box>
          ) : null}
        </Box>

        {accountMode === "LIVE" && armPreflightMutation.error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {armPreflightMutation.error instanceof Error ? armPreflightMutation.error.message : "Không kiểm tra được điều kiện ARM LIVE."}
          </Alert>
        ) : null}
        {accountMode === "LIVE" && armMutation.error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {armMutation.error instanceof Error ? armMutation.error.message : "ARM/DISARM bị từ chối."}
          </Alert>
        ) : null}
        {accountMode === "LIVE" && armStatus.data ? (
          <Alert severity={armStatus.data.status === "PASS" ? "success" : armStatus.data.status === "FAIL" ? "error" : "info"} sx={{ mt: 1.5 }}>
            {armStatus.data.action} · {armStatus.data.status} · {armStatus.data.phase} · {armStatus.data.message} · ARM {armStatus.data.finalArmStatus}
          </Alert>
        ) : null}
        {autoMutation.isSuccess && isAutoActive ? (
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