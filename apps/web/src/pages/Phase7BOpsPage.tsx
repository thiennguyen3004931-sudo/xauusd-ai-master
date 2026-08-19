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


async function sendTelegramRecoveryTest(): Promise<ActionResponse> {
  return readJson<ActionResponse>(await fetch(`${API_BASE}/api/v1/phase7b-telegram-test/recovery`, {
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
          <Chip size="small" label={online ? "ĐANG CHẠY" : "ĐANG DỪNG"} color={online ? "success" : "default"} variant="outlined" />
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
  const recoveryTelegramTest = useMutation({ mutationFn: sendTelegramRecoveryTest });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được trạng thái Bot & Telegram."} />;
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
        <Typography variant="overline" color="primary" fontWeight={900}>VẬN HÀNH DEMO</Typography>
        <Typography variant="h4" fontWeight={950}>Hệ thống & Telegram</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.7}>
          Một màn hình cho Bot DEMO, Telegram và MT5 Bridge. Tài khoản thật luôn bị khóa.
        </Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatusCard
            icon={<SmartToyRounded color={o.bot.alive ? "success" : "disabled"} />}
            title="BOT DEMO"
            status={botStarting ? "ĐANG KHỞI ĐỘNG..." : o.bot.alive ? (o.bot.managedPosition ? "ĐANG QUẢN LÝ LỆNH" : "ĐANG CHỜ TÍN HIỆU") : "ĐÃ DỪNG"}
            detail={botStarting ? "Đang khởi động và kiểm tra heartbeat controller..." : o.bot.alive ? `PID ${o.bot.pid ?? "—"} · ${o.bot.armed ? "ĐÃ ARM" : "CHƯA ARM"}` : "Controller DEMO chưa chạy."}
            online={o.bot.alive}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <StatusCard
            icon={<TelegramRounded color={o.telegram.alive ? "success" : "disabled"} />}
            title="THÔNG BÁO TELEGRAM"
            status={telegramStarting ? "ĐANG KHỞI ĐỘNG..." : o.telegram.alive ? "ĐANG GỬI THÔNG BÁO" : "ĐÃ TẮT THÔNG BÁO"}
            detail={telegramStarting ? "Đang kiểm tra notifier và heartbeat..." : o.telegram.alive ? "Thông báo tín hiệu / khớp lệnh / +6 / +10 / HOLD / đóng lệnh / lỗi." : "Không gửi thông báo thường trực."}
            online={o.telegram.alive}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <StatusCard
            icon={<HubRounded color={demoReady ? "success" : "disabled"} />}
            title="MT5 DEMO"
            status={demoReady ? "SẴN SÀNG" : "CHƯA SẴN SÀNG"}
            detail={`${o.bridge.accountMode?.toUpperCase() ?? "KHÔNG RÕ"} #${o.bridge.accountLogin ?? "—"} · ${o.bridge.server ?? "—"}`}
            online={demoReady}
          />
        </Grid>
      </Grid>

      {o.bot.managedPosition && (
        <Alert severity="warning">
          Bot đang quản lý một vị thế. Nút <b>Dừng Bot DEMO</b> bị khóa để tránh bỏ vị thế đang mở không được quản lý.
        </Alert>
      )}

      {!demoReady && (
        <Alert severity="warning">
          MT5 DEMO chưa đủ điều kiện chạy Bot. Kiểm tra Bridge, Algo Trading và quyền Expert Trading.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={900}>Bot giao dịch DEMO</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Điều kiện vào lệnh: 2 mô hình nến + Supertrend M15 cùng hướng + M5 cùng hướng và fresh flip ≤ 2 nến đóng. FVG chỉ là bối cảnh. Khối lượng mặc định 0.03 lot.
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
                Telegram chỉ đọc journal/API và gửi thông báo; không có quyền đặt, sửa hoặc đóng lệnh MT5.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={2.5} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  startIcon={<TelegramRounded />}
                  disabled={actionPending || o.telegram.alive || !o.controlEnabled}
                  onClick={() => mutate.mutate("telegram/start")}
                  sx={{ fontWeight: 900, minWidth: 170 }}
                >
                  {telegramStarting ? "ĐANG BẬT..." : "BẬT TELEGRAM"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopRounded />}
                  disabled={actionPending || !o.telegram.alive || !o.controlEnabled}
                  onClick={() => mutate.mutate("telegram/stop")}
                  sx={{ fontWeight: 900, minWidth: 170 }}
                >
                  {telegramStopping ? "ĐANG TẮT..." : "TẮT TELEGRAM"}
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
                Mẫu hồi phục là one-shot, chỉ gửi PREVIEW; không đặt/sửa/đóng lệnh MT5 và không ghi journal giao dịch.
              </Typography>
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
      {recoveryTelegramTest.isSuccess && <Alert severity="success">{recoveryTelegramTest.data.message}</Alert>}
      {recoveryTelegramTest.isError && (
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
          {recoveryTelegramTest.error instanceof Error ? recoveryTelegramTest.error.message : "Không gửi được mẫu hồi phục Telegram."}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={900}>Nội dung Telegram sẽ giải thích gì?</Typography>
          <Grid container spacing={1.5} mt={0.4}>
            <Grid size={{ xs: 12, md: 6 }}><Typography variant="body2">✓ <b>Vì sao vào lệnh:</b> mô hình nến, hướng M15, M5 fresh flip, giá vào, SL và bối cảnh FVG.</Typography></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Typography variant="body2">✓ <b>Vì sao HOLD:</b> trạng thái +6 hòa vốn, +10 chốt 1/3, runner còn lại và lý do chưa thoát.</Typography></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Typography variant="body2">✓ <b>Khi quản lý:</b> dời SL, khối lượng còn lại, lãi/lỗ runner.</Typography></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Typography variant="body2">✓ <b>Khi đóng:</b> P&amp;L, giá thoát và lý do đóng.</Typography></Grid>
          </Grid>
        </CardContent>
      </Card>

      <Alert severity="info">
        Quản lý hiện hành: +6 giá → dời SL về hòa vốn · +10 giá → chốt 1/3 · phần còn lại tiếp tục runner canonical. H1/H4 và FVG chỉ là bối cảnh, không phải TP cứng.
      </Alert>
    </Stack>
  );
}
