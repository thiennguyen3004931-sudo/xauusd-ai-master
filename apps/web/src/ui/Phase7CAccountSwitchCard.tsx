import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const ACCOUNT_SWITCH_BASE = "/api/v1/phase7c-account-switch";
const CONTROL_DIRECT = "http://127.0.0.1:3711";

type AccountMode = "DEMO" | "LIVE";
type SwitchChecks = Record<string, boolean>;

type Capability = {
  taskInstalled: boolean;
  currentAccountMode: AccountMode;
  currentBotMode: string;
  liveArmFilePresent: boolean;
  webCanSwitchAccount: true;
  webCanArmLive: false;
  policy: {
    explicitPauseRequired: true;
    zeroPositionsRequired: true;
    flatManagedStateRequired: true;
    typedConfirmationRequired: true;
    finalBotMode: "PAUSE";
    finalLiveArmStatus: "DISARMED";
    armAfterLiveSwitch: false;
  };
};

type Preflight = {
  approved: boolean;
  currentMode: AccountMode;
  targetMode: AccountMode;
  currentBotMode: string;
  openXauusdPositions: number;
  liveArmFilePresent: boolean;
  checks: SwitchChecks;
  note: string;
  preflightToken: string | null;
  expiresAt: number | null;
};

type ExecuteResponse = {
  accepted: true;
  requestId: string;
  targetMode: AccountMode;
  status: "RUNNING";
  message: string;
};

type SwitchStatus = {
  requestId: string;
  targetMode: AccountMode;
  status: "RUNNING" | "PASS" | "FAIL";
  phase: string;
  message: string;
  finalAccountMode: string;
  finalBotMode: string;
  liveArmFilePresent: boolean;
};

async function safeJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
  }
  return payload as T;
}

async function accountSwitchRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const urls = [`${ACCOUNT_SWITCH_BASE}${path}`, `${CONTROL_DIRECT}${ACCOUNT_SWITCH_BASE}${path}`];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store", ...init });
      return await safeJson<T>(response);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Không kết nối được");
    }
  }
  throw new Error(errors.join(" | "));
}

async function setPause() {
  const urls = ["/api/v1/phase7c/bot-mode", `${CONTROL_DIRECT}/api/v1/phase7c/bot-mode`];
  const body = JSON.stringify({ mode: "PAUSE", source: "web-account-switch-explicit-pause" });
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body,
      });
      return await safeJson<any>(response);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Không kết nối được");
    }
  }
  throw new Error(errors.join(" | "));
}

const CHECK_LABELS: Record<string, string> = {
  taskInstalled: "Elevated switch task đã đăng ký",
  accountStateValid: "Account state hợp lệ",
  notAlreadyTarget: "Target khác account hiện tại",
  botPaused: "Bot đang PAUSE",
  runtimeReady: "Runtime/Telegram đang READY",
  bridgeMatchesSelectedAccount: "Bridge khớp account đang chọn",
  zeroXauusdPositions: "XAUUSD positions = 0",
  noTrendManagedTicket: "Trend không quản lý ticket",
  noSidewayManagedTicket: "Sideway không quản lý ticket",
  noTrendPendingPullback: "Trend không có pending pullback",
  noSidewayPendingEntry: "Sideway không có pending entry",
  noExecutionLock: "Không có execution lock",
  demoToLiveArmSafe: "Trạng thái chuyển LIVE an toàn",
  noSwitchRunning: "Không có account switch khác đang chạy",
};

export function Phase7CAccountSwitchCard() {
  const queryClient = useQueryClient();
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  const capabilityQuery = useQuery({
    queryKey: ["phase7c-account-switch-capability"],
    queryFn: () => accountSwitchRequest<Capability>("/capability"),
    refetchInterval: requestId ? false : 3_000,
    retry: false,
  });

  const currentMode = capabilityQuery.data?.currentAccountMode ?? "DEMO";
  const targetMode: AccountMode = currentMode === "LIVE" ? "DEMO" : "LIVE";
  const requiredConfirmation = targetMode === "LIVE" ? "SWITCH_TO_LIVE" : "SWITCH_TO_DEMO";

  const pauseMutation = useMutation({
    mutationFn: setPause,
    onSuccess: async () => {
      setPreflight(null);
      setConfirmation("");
      await queryClient.invalidateQueries();
    },
  });

  const preflightMutation = useMutation({
    mutationFn: () => accountSwitchRequest<Preflight>("/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetMode }),
    }),
    onSuccess: (result) => {
      setPreflight(result);
      setConfirmation("");
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!preflight?.preflightToken) throw new Error("Chưa có preflight token hợp lệ.");
      return accountSwitchRequest<ExecuteResponse>("/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetMode,
          preflightToken: preflight.preflightToken,
          confirmation,
        }),
      });
    },
    onSuccess: (result) => setRequestId(result.requestId),
  });

  const statusQuery = useQuery({
    queryKey: ["phase7c-account-switch-status", requestId],
    queryFn: () => accountSwitchRequest<SwitchStatus>(`/status?requestId=${encodeURIComponent(requestId ?? "")}`),
    enabled: Boolean(requestId),
    refetchInterval: (query) => {
      const status = (query.state.data as SwitchStatus | undefined)?.status;
      return status === "PASS" || status === "FAIL" ? false : 2_000;
    },
    retry: false,
  });

  const status = statusQuery.data;
  const switchRunning = Boolean(requestId && (!status || status.status === "RUNNING"));
  const switchDone = status?.status === "PASS" || status?.status === "FAIL";
  const canExecute = Boolean(
    preflight?.approved &&
    preflight.preflightToken &&
    confirmation === requiredConfirmation &&
    !switchRunning,
  );

  const checkRows = useMemo(() => Object.entries(preflight?.checks ?? {}), [preflight]);

  const resetAfterDone = async () => {
    setRequestId(null);
    setPreflight(null);
    setConfirmation("");
    await queryClient.invalidateQueries();
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 4, borderColor: "warning.main" }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline" color="warning.main" fontWeight={950}>CHUYỂN TÀI KHOẢN DEMO / LIVE</Typography>
            <Typography variant="h5" fontWeight={950}>Guarded account switch · 2 bước xác nhận</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.8}>
              Web chỉ gửi yêu cầu localhost tới elevated task cố định. Account switch không cấp quyền AUTO và không gửi order. Lot/risk không thay đổi sau switch.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <Chip label={`HIỆN TẠI ${currentMode}`} color={currentMode === "LIVE" ? "warning" : "success"} sx={{ fontWeight: 950 }} />
            <Chip label={`TARGET ${targetMode}`} variant="outlined" sx={{ fontWeight: 950 }} />
            <Chip label={`BOT ${capabilityQuery.data?.currentBotMode ?? "—"}`} variant="outlined" sx={{ fontWeight: 950 }} />
          </Stack>
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        {capabilityQuery.isError && <Alert severity="error">Không đọc được account-switch capability: {capabilityQuery.error instanceof Error ? capabilityQuery.error.message : "lỗi không xác định"}</Alert>}
        {capabilityQuery.data && !capabilityQuery.data.taskInstalled && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Elevated task chưa được đăng ký. Chạy một lần bằng PowerShell Administrator: <b>scripts/register-phase7c-account-switch-task-local.ps1 -WorkDir .runtime</b>. Web sẽ không fallback sang đường kém an toàn hơn.
          </Alert>
        )}
        {capabilityQuery.data?.currentBotMode !== "PAUSE" && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Account switch bị khóa vì bot đang <b>{capabilityQuery.data?.currentBotMode}</b>. PAUSE là thao tác riêng; Web không tự PAUSE ngầm.
          </Alert>
        )}
        {pauseMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{pauseMutation.error instanceof Error ? pauseMutation.error.message : "Không chuyển được PAUSE."}</Alert>}
        {preflightMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{preflightMutation.error instanceof Error ? preflightMutation.error.message : "Preflight thất bại."}</Alert>}
        {executeMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{executeMutation.error instanceof Error ? executeMutation.error.message : "Switch bị từ chối."}</Alert>}

        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <Button
            variant="outlined"
            color="warning"
            disabled={pauseMutation.isPending || switchRunning || capabilityQuery.data?.currentBotMode === "PAUSE"}
            onClick={() => {
              if (window.confirm("Xác nhận chuyển bot về PAUSE? Thao tác này KHÔNG switch account.")) pauseMutation.mutate();
            }}
            sx={{ fontWeight: 950 }}
          >
            {pauseMutation.isPending ? "Đang PAUSE..." : "Đưa Bot về PAUSE"}
          </Button>
          <Button
            variant="contained"
            disabled={preflightMutation.isPending || switchRunning || !capabilityQuery.data?.taskInstalled || capabilityQuery.data?.currentBotMode !== "PAUSE"}
            onClick={() => preflightMutation.mutate()}
            sx={{ fontWeight: 950 }}
          >
            {preflightMutation.isPending ? "Đang kiểm tra..." : `1. Kiểm tra điều kiện → ${targetMode}`}
          </Button>
        </Stack>

        {preflight && (
          <Box mt={2.5} sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(15,23,42,.45)", border: "1px solid rgba(148,163,184,.14)" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={1.5}>
              <Typography fontWeight={950}>Kết quả preflight</Typography>
              <Chip label={preflight.approved ? "PASS" : "BLOCKED"} color={preflight.approved ? "success" : "error"} size="small" sx={{ fontWeight: 950 }} />
            </Stack>
            <Stack spacing={0.8}>
              {checkRows.map(([key, passed]) => (
                <Stack key={key} direction="row" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">{CHECK_LABELS[key] ?? key}</Typography>
                  <Typography variant="body2" fontWeight={900} color={passed ? "success.main" : "error.main"}>{passed ? "PASS" : "BLOCK"}</Typography>
                </Stack>
              ))}
            </Stack>
            <Alert severity={targetMode === "LIVE" ? "warning" : "info"} sx={{ mt: 2 }}>
              {preflight.approved
                ? `Đã đủ điều kiện chuyển sang ${targetMode}.`
                : `Chưa đủ điều kiện chuyển sang ${targetMode}; kiểm tra các mục BLOCK phía trên.`}
            </Alert>

            {preflight.approved && (
              <Stack spacing={1.5} mt={2}>
                <Typography variant="body2">
                  Bước 2: nhập chính xác <b>{requiredConfirmation}</b>. Token preflight chỉ có hiệu lực ngắn; runtime sẽ được kiểm tra lại ngay trước mutation.
                </Typography>
                <TextField
                  label="Xác nhận account switch"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
                  placeholder={requiredConfirmation}
                  disabled={switchRunning}
                  fullWidth
                />
                <Button
                  variant="contained"
                  color={targetMode === "LIVE" ? "warning" : "primary"}
                  disabled={!canExecute || executeMutation.isPending}
                  onClick={() => {
                    const message = targetMode === "LIVE"
                      ? "Xác nhận guarded switch DEMO → LIVE? Kết quả bắt buộc LIVE + PAUSE; KHÔNG tự bật AUTO."
                      : "Xác nhận LIVE → DEMO? Kết quả bắt buộc DEMO + PAUSE; KHÔNG tự bật AUTO.";
                    if (window.confirm(message)) executeMutation.mutate();
                  }}
                  sx={{ fontWeight: 950 }}
                >
                  {executeMutation.isPending ? "Đang gửi yêu cầu..." : `2. Xác nhận chuyển sang ${targetMode}`}
                </Button>
              </Stack>
            )}
          </Box>
        )}

        {requestId && (
          <Box mt={2.5}>
            <Alert severity={status?.status === "PASS" ? "success" : status?.status === "FAIL" ? "error" : "info"}>
              <Typography fontWeight={950}>Account switch: {status?.status ?? "RUNNING"} · {status?.phase ?? "QUEUED"}</Typography>
              <Typography variant="body2" mt={0.5}>{status?.message ?? "Elevated task đang xử lý. Không đóng API/MT5 trong lúc switch."}</Typography>
              {status?.status === "PASS" && (
                <Typography variant="body2" mt={0.5}>Final: {status.finalAccountMode} · Bot {status.finalBotMode}.</Typography>
              )}
            </Alert>
            {switchDone && (
              <Button variant="outlined" onClick={resetAfterDone} sx={{ mt: 1.5, fontWeight: 900 }}>Nạp lại trạng thái</Button>
            )}
          </Box>
        )}

        <Typography variant="caption" color="text.secondary" display="block" mt={2.2} sx={{ lineHeight: 1.7 }}>
          Ranh giới an toàn: account switch chỉ chạy trên localhost qua Scheduled Task RunLevel Highest. Sau switch bot luôn ở PAUSE; Web account-switch không tự bật AUTO, không đổi lot/risk và không có quyền gửi order.
        </Typography>
      </CardContent>
    </Card>
  );
}