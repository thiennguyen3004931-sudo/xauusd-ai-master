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
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import TelegramRounded from "@mui/icons-material/Telegram";
import HubRounded from "@mui/icons-material/HubRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "../ui/PageState";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type DemoSnapshot = {
  botStatus: string;
  runtime: { armed?: boolean; alive?: boolean; pid?: number | null } | null;
  mt5: {
    reachable: boolean;
    health: {
      accountMode?: "demo" | "contest" | "real";
      tradingEnabled?: boolean;
      terminalTradeAllowed?: boolean;
      expertTradeAllowed?: boolean;
    } | null;
  };
};

type TaskStatus = {
  key: "bridge" | "bot" | "telegram" | "web";
  name: string;
  exists: boolean;
  state: string;
};

type OpsStatus = {
  localOnly: boolean;
  controlEnabled: boolean;
  generatedAt: number;
  tasks: TaskStatus[];
  processes: { botAlive: boolean; telegramAlive: boolean; webAlive: boolean };
  bridge: {
    reachable: boolean;
    status: string;
    accountMode: string | null;
    tradingEnabled: boolean | null;
  };
  safety: {
    demoOnly: boolean;
    directOrderRouteExposed: boolean;
    startAction: string;
  };
};

type StartResponse = {
  accepted: boolean;
  actions: string[];
  message: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T | { error?: string };
  if (!response.ok) {
    throw new Error("error" in (payload as object) && (payload as { error?: string }).error
      ? String((payload as { error?: string }).error)
      : `HTTP ${response.status}`);
  }
  return payload as T;
}

async function getDemo(): Promise<DemoSnapshot> {
  return readJson<DemoSnapshot>(await fetch(`${API_BASE}/api/v1/phase7b-demo`, { cache: "no-store" }));
}

async function getOps(): Promise<OpsStatus> {
  return readJson<OpsStatus>(await fetch(`${API_BASE}/api/v1/phase7b-ops/status`, { cache: "no-store" }));
}

async function startStack(): Promise<StartResponse> {
  return readJson<StartResponse>(await fetch(`${API_BASE}/api/v1/phase7b-ops/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }));
}

function taskByKey(tasks: TaskStatus[], key: TaskStatus["key"]): TaskStatus | undefined {
  return tasks.find((task) => task.key === key);
}

function statusColor(ok: boolean): "success" | "default" {
  return ok ? "success" : "default";
}

export function Phase7BOpsPage() {
  const queryClient = useQueryClient();
  const demo = useQuery({
    queryKey: ["phase7b-demo-ops"],
    queryFn: getDemo,
    refetchInterval: 5_000,
    retry: false,
  });
  const ops = useQuery({
    queryKey: ["phase7b-ops-status"],
    queryFn: getOps,
    refetchInterval: 5_000,
    retry: false,
  });
  const start = useMutation({
    mutationFn: startStack,
    onSuccess: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["phase7b-demo-ops"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7b-ops-status"] }),
      ]);
    },
  });

  if (demo.isLoading || ops.isLoading) return <LoadingState />;
  if (!demo.data || !ops.data) {
    const error = demo.error ?? ops.error;
    return <ErrorState message={error instanceof Error ? error.message : "Không đọc được trạng thái Bot & Telegram."} />;
  }

  const d = demo.data;
  const o = ops.data;
  const botTask = taskByKey(o.tasks, "bot");
  const telegramTask = taskByKey(o.tasks, "telegram");
  const bridgeTask = taskByKey(o.tasks, "bridge");
  const webTask = taskByKey(o.tasks, "web");
  const allTasksInstalled = o.tasks.every((task) => task.exists);
  const coreTasksInstalled = o.tasks.filter((task) => task.key !== "web").every((task) => task.exists);
  const demoGuard = Boolean(
    d.mt5.reachable &&
      d.mt5.health?.accountMode === "demo" &&
      d.mt5.health?.tradingEnabled === true &&
      d.mt5.health?.terminalTradeAllowed === true &&
      d.mt5.health?.expertTradeAllowed === true,
  );

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="primary" fontWeight={900}>VẬN HÀNH TỰ ĐỘNG</Typography>
        <Typography variant="h5" fontWeight={900}>Bot & Telegram</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Khởi động Phase 7B DEMO bằng Windows Scheduled Tasks. Web chỉ điều khiển task local; không có API đặt, sửa hoặc đóng lệnh MT5.
        </Typography>
      </Box>

      <Alert severity="info">
        Nút bên dưới chỉ gọi Scheduled Task local trên chính máy này. Bot vẫn phải vượt toàn bộ DEMO guard và allow-list trước khi có quyền gửi lệnh.
      </Alert>

      {!allTasksInstalled && (
        <Alert severity="warning">
          Chưa cài đủ Scheduled Task. Chạy lại <code>scripts/install-phase7b-autostart.ps1</code> để cài Bot + Telegram + Bridge + Web tự khởi động khi đăng nhập Windows.
        </Alert>
      )}

      {d.mt5.health?.accountMode === "real" && (
        <Alert severity="error">REAL account detected — chức năng Start DEMO bị khóa.</Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <SmartToyRounded color={o.processes.botAlive ? "success" : "disabled"} />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>BOT PHASE 7B</Typography>
              <Typography variant="h6" fontWeight={900}>{d.botStatus}</Typography>
              <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={o.processes.botAlive ? "PROCESS ONLINE" : "PROCESS OFFLINE"} color={statusColor(o.processes.botAlive)} variant="outlined" />
                <Chip size="small" label={d.runtime?.armed ? "ARMED" : "NOT ARMED"} color={statusColor(Boolean(d.runtime?.armed))} variant="outlined" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <TelegramRounded color={o.processes.telegramAlive ? "success" : "disabled"} />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>TELEGRAM</Typography>
              <Typography variant="h6" fontWeight={900}>{o.processes.telegramAlive ? "ONLINE" : "OFFLINE"}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Journal notifier · chỉ gửi thông báo, không có quyền MT5.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <HubRounded color={o.bridge.reachable ? "success" : "disabled"} />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>MT5 BRIDGE</Typography>
              <Typography variant="h6" fontWeight={900}>{o.bridge.reachable ? "ONLINE" : "OFFLINE"}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                {o.bridge.accountMode?.toUpperCase() ?? "UNKNOWN"} · trading {o.bridge.tradingEnabled ? "ON" : "OFF"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <ScheduleRounded color={allTasksInstalled ? "success" : "disabled"} />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>WINDOWS AUTOSTART</Typography>
              <Typography variant="h6" fontWeight={900}>{allTasksInstalled ? "INSTALLED" : "INCOMPLETE"}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Bridge {bridgeTask?.state ?? "—"} · Bot {botTask?.state ?? "—"} · Telegram {telegramTask?.state ?? "—"} · Web {webTask?.state ?? "—"}
              </Typography>
              <Chip
                size="small"
                sx={{ mt: 1 }}
                label={o.processes.webAlive ? "WEB ONLINE" : "WEB OFFLINE"}
                color={statusColor(o.processes.webAlive)}
                variant="outlined"
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
            <Box>
              <Typography variant="h6" fontWeight={900}>Khởi động DEMO stack</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Idempotent: nếu Bot hoặc Telegram đã chạy thì không tạo thêm bản sao. Web có task autostart riêng để lần mở máy sau không cần chạy PowerShell.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrowRounded />}
              disabled={start.isPending || !o.controlEnabled || !coreTasksInstalled || d.mt5.health?.accountMode === "real"}
              onClick={() => start.mutate()}
              sx={{ minWidth: 250, fontWeight: 900 }}
            >
              {start.isPending ? "Đang yêu cầu…" : "KHỞI ĐỘNG BOT + TELEGRAM"}
            </Button>
          </Stack>

          {start.isSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {start.data.message}<br />
              {start.data.actions.join(" · ")}
            </Alert>
          )}
          {start.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {start.error instanceof Error ? start.error.message : "Không thể khởi động Phase 7B stack."}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Alert severity={demoGuard ? "success" : "warning"}>
        {demoGuard
          ? "DEMO guard hiện PASS. Bot vẫn tự kiểm tra lại guard trong chính controller trước mỗi chu kỳ."
          : "DEMO guard hiện chưa đủ điều kiện. Start task không bỏ qua guard; bot sẽ chờ/không giao dịch cho đến khi MT5 DEMO và Bridge sẵn sàng."}
      </Alert>
    </Stack>
  );
}
