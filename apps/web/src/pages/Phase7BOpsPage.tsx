import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import TelegramRounded from "@mui/icons-material/Telegram";
import HubRounded from "@mui/icons-material/HubRounded";
import ShieldRounded from "@mui/icons-material/ShieldRounded";
import { useQuery } from "@tanstack/react-query";
import { safeReadJson } from "../api";
import { LoadingState } from "../ui/PageState";
import { StatusChip } from "../ui/StatusChip";

type OpsStatus = {
  bot?: { alive?: boolean; armed?: boolean; status?: string; pid?: number | null; managedPosition?: boolean };
  telegram?: { alive?: boolean; status?: string; pid?: number | null; wrapperPid?: number | null; heartbeatAgeMs?: number | null; heartbeatFresh?: boolean };
  bridge?: { reachable?: boolean; status?: string; accountMode?: string | null; accountLogin?: number | null; server?: string | null; tradingEnabled?: boolean | null; terminalTradeAllowed?: boolean | null; expertTradeAllowed?: boolean | null };
  safety?: { demoOnly?: boolean; directOrderRouteExposed?: boolean; botStopBlockedWhileManaging?: boolean };
};

type LotSnapshot = {
  state?: { trendFixedLot?: number; sidewayRiskPercent?: number; sidewayMaxLot?: number };
  active?: { armed?: boolean; supervisorPid?: number | null };
  activeAlive?: boolean;
  restartRequired?: boolean;
  appliesTo?: string;
  safety?: { demoOnly?: boolean; existingPositionMutation?: boolean; martingale?: boolean; recoveryLotEscalation?: boolean };
};

type BotModeSnapshot = { state?: { mode?: string } };

type DecisionSnapshot = {
  preTrade?: { strategy?: string; stage?: string };
  safety?: { mt5PanelOrderPermission?: string; autoLotSafety?: string };
};

type RegimeSnapshot = { regime?: string; recommendedMode?: string; confidence?: number };

type Status = {
  ops?: OpsStatus;
  lot?: LotSnapshot;
  botMode?: BotModeSnapshot;
  decision?: DecisionSnapshot;
  regime?: RegimeSnapshot;
  errors: string[];
};

async function load<T>(url: string, label: string): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await safeReadJson<T>(await fetch(url, { cache: "no-store" }), label) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : `${label} chưa sẵn sàng.` };
  }
}

async function getStatus(): Promise<Status> {
  const [ops, lot, botMode, decision, regime] = await Promise.all([
    load<OpsStatus>("/api/v1/phase7b-ops/status", "Hệ thống & Telegram"),
    load<LotSnapshot>("/api/v1/phase7c/lot-settings", "Lot settings"),
    load<BotModeSnapshot>("/api/v1/phase7c/bot-mode", "Bot mode"),
    load<DecisionSnapshot>("/api/v1/phase7c/decision-monitor?symbol=XAUUSD", "Decision monitor"),
    load<RegimeSnapshot>("/api/v1/phase7c/live-regime?symbol=XAUUSD", "Regime Phase7C"),
  ]);

  return {
    ops: ops.data,
    lot: lot.data,
    botMode: botMode.data,
    decision: decision.data,
    regime: regime.data,
    errors: [ops.error, lot.error, botMode.error, decision.error, regime.error].filter(Boolean) as string[],
  };
}

function dash(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "n/a") return "Chưa có";
  return String(value);
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "Có";
  if (value === false) return "Không";
  return "Chưa rõ";
}

function statusTone(ok?: boolean | null): "success" | "warning" | "default" {
  if (ok === true) return "success";
  if (ok === false) return "warning";
  return "default";
}

function modeDisplay(mode?: string, effective?: string) {
  if (!mode) return "Chưa rõ";
  if (effective && effective !== mode) return `${mode} → ${effective}`;
  return mode;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={900} textAlign="right">{value}</Typography>
    </Stack>
  );
}

function StatusCard({ icon, title, status, detail, ok }: { icon: React.ReactNode; title: string; status: string; detail: string; ok?: boolean | null }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>{icon}</Box>
          <Chip size="small" label={ok ? "PASS" : ok === false ? "CHỜ" : "CHECK"} color={statusTone(ok)} variant="outlined" />
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>{title}</Typography>
        <Typography variant="h6" fontWeight={950}>{status}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

export function Phase7BOpsPage() {
  const query = useQuery({
    queryKey: ["phase7c-system-telegram-sync"],
    queryFn: getStatus,
    refetchInterval: 2_000,
    retry: false,
  });

  if (query.isLoading) return <LoadingState />;

  const data = query.data;
  const ops = data?.ops;
  const lot = data?.lot;
  const mode = data?.botMode?.state?.mode;
  const effective = data?.decision?.preTrade?.strategy ?? data?.regime?.recommendedMode;
  const bridge = ops?.bridge;
  const telegram = ops?.telegram;
  const runtimeOk = Boolean(lot?.activeAlive || ops?.bot?.alive);
  const lotOk = Boolean(lot?.activeAlive && lot?.restartRequired === false);
  const demoReady = Boolean(bridge?.reachable && bridge?.accountMode === "demo" && bridge?.tradingEnabled === true);
  const telegramOk = Boolean(telegram?.alive && (telegram.heartbeatFresh || telegram.status === "READY" || telegram.status === "PASS"));

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>VẬN HÀNH DEMO</Typography>
          <Typography variant="h4" fontWeight={950}>Hệ thống & Telegram</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.7}>Đồng bộ trạng thái runtime Phase7C, Telegram, MT5 Bridge, lot binding và safety. Không hiển thị lỗi HTTP thô.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <StatusChip value={modeDisplay(mode, effective)} />
          <StatusChip value={lotOk ? "LOT ACTIVE" : "LOT CHECK"} />
          <StatusChip value={telegramOk ? "TELEGRAM READY" : "TELEGRAM CHECK"} />
        </Stack>
      </Stack>

      {data?.errors.length ? (
        <Alert severity="warning">Một vài endpoint chưa phản hồi chuẩn JSON: {data.errors.slice(0, 2).join(" · ")}</Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatusCard
            icon={<SmartToyRounded color={runtimeOk ? "success" : "disabled"} />}
            title="PHASE7C RUNTIME"
            status={runtimeOk ? "EXECUTORS ĐANG CHẠY" : "CHƯA XÁC NHẬN"}
            detail={`Supervisor PID ${dash(lot?.active?.supervisorPid ?? ops?.bot?.pid)} · armed ${yesNo(lot?.active?.armed ?? ops?.bot?.armed)}`}
            ok={runtimeOk}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatusCard
            icon={<TelegramRounded color={telegramOk ? "success" : "disabled"} />}
            title="TELEGRAM MODE"
            status={telegramOk ? "READY / PASS" : dash(telegram?.status)}
            detail={`PID ${dash(telegram?.pid)} · heartbeat ${dash(telegram?.heartbeatAgeMs)} ms`}
            ok={telegramOk}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatusCard
            icon={<HubRounded color={demoReady ? "success" : "disabled"} />}
            title="MT5 BRIDGE"
            status={demoReady ? "DEMO SẴN SÀNG" : "ĐANG KIỂM TRA"}
            detail={`${dash(bridge?.accountMode).toUpperCase()} #${dash(bridge?.accountLogin)} · ${dash(bridge?.server)}`}
            ok={demoReady}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatusCard
            icon={<ShieldRounded color={lot?.safety?.demoOnly ? "success" : "disabled"} />}
            title="SAFETY"
            status={lot?.safety?.demoOnly ? "DEMO ONLY" : "CHECK"}
            detail={`ORDER ${data?.decision?.safety?.mt5PanelOrderPermission ?? "NONE"} · ownership/pass được verify bằng script`}
            ok={lot?.safety?.demoOnly}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={950}>Runtime</Typography>
              <Stack spacing={1.2} mt={1.4}>
                <Info label="Active mode" value={dash(mode)} />
                <Info label="Effective strategy" value={dash(effective)} />
                <Info label="Decision stage" value={dash(data?.decision?.preTrade?.stage)} />
                <Info label="Regime" value={`${dash(data?.regime?.regime)} · Conf ${dash(data?.regime?.confidence)}`} />
                <Info label="Active alive" value={yesNo(lot?.activeAlive)} />
                <Info label="Restart required" value={yesNo(lot?.restartRequired)} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={950}>Lot / Risk</Typography>
              <Stack spacing={1.2} mt={1.4}>
                <Info label="Trend fixed lot" value={dash(lot?.state?.trendFixedLot)} />
                <Info label="Sideway risk percent" value={`${dash(lot?.state?.sidewayRiskPercent)}%`} />
                <Info label="Sideway max lot" value={dash(lot?.state?.sidewayMaxLot)} />
                <Info label="Applies to" value={dash(lot?.appliesTo)} />
                <Info label="Existing mutation" value={yesNo(lot?.safety?.existingPositionMutation)} />
                <Info label="Martingale" value={yesNo(lot?.safety?.martingale)} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={950}>MT5 / Telegram</Typography>
              <Stack spacing={1.2} mt={1.4}>
                <Info label="Bridge reachable" value={yesNo(bridge?.reachable)} />
                <Info label="Trading enabled" value={yesNo(bridge?.tradingEnabled)} />
                <Info label="Terminal trade" value={yesNo(bridge?.terminalTradeAllowed)} />
                <Info label="Expert trade" value={yesNo(bridge?.expertTradeAllowed)} />
                <Info label="Telegram alive" value={yesNo(telegram?.alive)} />
                <Info label="Telegram heartbeat fresh" value={yesNo(telegram?.heartbeatFresh)} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Alert severity="info">
        Panel MT5 và Web chỉ hiển thị trạng thái. Quyền gửi lệnh vẫn do executor DEMO quản lý; MT5 panel giữ <b>READ ONLY | ORDER NONE</b>.
      </Alert>
    </Stack>
  );
}
