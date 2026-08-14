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
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import StopRounded from "@mui/icons-material/StopRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import TelegramRounded from "@mui/icons-material/Telegram";
import HubRounded from "@mui/icons-material/HubRounded";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "../ui/PageState";

const API_BASE = "";

type OpsStatus = {
  localOnly: boolean;
  controlEnabled: boolean;
  generatedAt: number;
  bot: {
    alive: boolean;
    armed: boolean;
    status: string;
    pid: number | null;
    managedPosition: boolean;
    canStop: boolean;
  };
  telegram: {
    alive: boolean;
    status: string;
    pid: number | null;
    wrapperPid: number | null;
    heartbeatAgeMs: number | null;
    heartbeatFresh: boolean;
  };
  bridge: {
    reachable: boolean;
    status: string;
    accountMode: string | null;
    accountLogin: number | null;
    server: string | null;
    tradingEnabled: boolean | null;
    terminalTradeAllowed: boolean | null;
    expertTradeAllowed: boolean | null;
  };
  safety: {
    demoOnly: boolean;
    realAccountAllowed: false;
    directOrderRouteExposed: false;
    botStopBlockedWhileManaging: true;
  };
};

type ActionResponse = {
  accepted: boolean;
  action: string;
  message: string;
  pid?: number | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: T | { error?: string };
  try {
    payload = JSON.parse(text) as T | { error?: string };
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error("error" in (payload as object) && (payload as { error?: string }).error
      ? String((payload as { error?: string }).error)
      : `HTTP ${response.status}`);
  }
  return payload as T;
}

async function getOps(): Promise<OpsStatus> {
  return readJson<OpsStatus>(await fetch(`${API_BASE}/api/v1/phase7b-ops/status`, { cache: "no-store" }));
}

async function runAction(path: string): Promise<ActionResponse> {
  return readJson<ActionResponse>(await fetch(`${API_BASE}/api/v1/phase7b-ops/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }));
}

function StatusCard({ icon, title, status, detail, online }: { icon: React.ReactNode; title: string; status: string; detail: string; online: boolean }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>{icon}</Box>
          <Chip size="small" label={online ? "ONLINE" : "OFFLINE"} color={online ? "success" : "default"} variant="outlined" />
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>{title}</Typography>
        <Typography variant="h6" fontWeight={900}>{status}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

export function Phase7BOpsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["phase7b-ops-status"],
    queryFn: getOps,
    refetchInterval: 2_000,
    retry: false,
  });

  const mutate = useMutation({
    mutationFn: runAction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["phase7b-ops-status"] });
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Bot & Telegram."} />;
  }

  const o = query.data;
  const demoReady = Boolean(
    o.bridge.reachable &&
    o.bridge.accountMode === "demo" &&
    o.bridge.tradingEnabled === true &&
    o.bridge.terminalTradeAllowed === true &&
    o.bridge.expertTradeAllowed === true,
  );

  const actionPending = mutate.isPending;
  const pendingAction = mutate.variables;
  const botStarting = actionPending && pendingAction === "bot/start";
  const botStopping = actionPending && pendingAction === "bot/stop";
  const telegramStarting = actionPending && pendingAction === "telegram/start";
  const telegramStopping = actionPending && pendingAction === "telegram/stop";

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="overline" color="primary" fontWeight={900}>DEMO CONTROL</Typography>
        <Typography variant="h4" fontWeight={950}>Bot & Telegram</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.7}>
          Chỉ điều khiển tiến trình local trên máy này. Tài khoản real luôn bị khóa.
        </Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatusCard
            icon={<SmartToyRounded color={o.bot.alive ? "success" : "disabled"} />}
            title="BOT DEMO"
            status={botStarting ? "STARTING..." : o.bot.alive ? (o.bot.managedPosition ? "MANAGING" : "WAITING SIGNAL") : "STOPPED"}
            detail={botStarting ? "Đang build + kiểm tra runtime controller..." : o.bot.alive ? `PID ${o.bot.pid ?? "—"} · ${o.bot.armed ? "ARMED" : "NOT ARMED"}` : "Controller DEMO chưa chạy."}
            online={o.bot.alive}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <StatusCard
            icon={<TelegramRounded color={o.telegram.alive ? "success" : "disabled"} />}
            title="TELEGRAM"
            status={telegramStarting ? "STARTING..." : o.telegram.alive ? "NOTIFY ON" : "NOTIFY OFF"}
            detail={telegramStarting ? "Đang kiểm tra notifier + heartbeat..." : o.telegram.alive ? "Đang gửi Signal / Filled / +6 / +10 / Exit / Error." : "Không gửi thông báo Telegram."}
            online={o.telegram.alive}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <StatusCard
            icon={<HubRounded color={demoReady ? "success" : "disabled"} />}
            title="MT5 DEMO"
            status={demoReady ? "READY" : "NOT READY"}
            detail={`${o.bridge.accountMode?.toUpperCase() ?? "UNKNOWN"} #${o.bridge.accountLogin ?? "—"} · ${o.bridge.server ?? "—"}`}
            online={demoReady}
          />
        </Grid>
      </Grid>

      {o.bot.managedPosition && (
        <Alert severity="warning">
          Bot đang quản lý một position. Nút <b>Dừng Bot DEMO</b> bị khóa để không bỏ position đang mở.
        </Alert>
      )}

      {!demoReady && (
        <Alert severity="warning">
          MT5 DEMO chưa đủ điều kiện chạy bot. Kiểm tra Bridge, Algo Trading và quyền Expert Trading.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={900}>Bot DEMO</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Entry hiện hành: 2 mô hình nến + Supertrend M15 + M5 fresh flip. FVG chỉ là context. Volume mặc định 0.03 lot.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={2.5}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PlayArrowRounded />}
                  disabled={actionPending || o.bot.alive || !o.controlEnabled || !demoReady}
                  onClick={() => mutate.mutate("bot/start")}
                  sx={{ fontWeight: 900, minWidth: 180 }}
                >
                  {botStarting ? "ĐANG BẬT BOT..." : "BẬT BOT DEMO"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopRounded />}
                  disabled={actionPending || !o.bot.alive || !o.bot.canStop || !o.controlEnabled}
                  onClick={() => mutate.mutate("bot/stop")}
                  sx={{ fontWeight: 900, minWidth: 180 }}
                >
                  {botStopping ? "ĐANG DỪNG..." : "DỪNG BOT DEMO"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={900}>Thông báo Telegram</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Telegram chỉ đọc journal và gửi thông báo. Không có quyền đặt hoặc sửa lệnh MT5.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={2.5}>
                <Button
                  variant="contained"
                  startIcon={<TelegramRounded />}
                  disabled={actionPending || o.telegram.alive || !o.controlEnabled}
                  onClick={() => mutate.mutate("telegram/start")}
                  sx={{ fontWeight: 900, minWidth: 180 }}
                >
                  {telegramStarting ? "ĐANG BẬT..." : "BẬT TELEGRAM"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopRounded />}
                  disabled={actionPending || !o.telegram.alive || !o.controlEnabled}
                  onClick={() => mutate.mutate("telegram/stop")}
                  sx={{ fontWeight: 900, minWidth: 180 }}
                >
                  {telegramStopping ? "ĐANG TẮT..." : "TẮT TELEGRAM"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {mutate.isSuccess && <Alert severity="success">{mutate.data.message}</Alert>}
      {mutate.isError && (
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
          {mutate.error instanceof Error ? mutate.error.message : "Không thực hiện được thao tác."}
        </Alert>
      )}

      <Alert severity="info">
        +6 → BE · +10 → chốt 1/3 · phần còn lại tiếp tục canonical runner. Web không mở quyền giao dịch cho tài khoản real.
      </Alert>
    </Stack>
  );
}
