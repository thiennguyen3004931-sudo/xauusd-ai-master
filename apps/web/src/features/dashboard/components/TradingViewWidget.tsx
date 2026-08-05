import { Box } from "@mui/material";
import { useEffect, useRef } from "react";

export default function TradingViewWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    container.current.innerHTML = "";

    const script = document.createElement("script");

    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

    script.async = true;

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: "OANDA:XAUUSD",
      interval: "15",
      timezone: "Asia/Ho_Chi_Minh",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_side_toolbar: false,
      withdateranges: true,
    });

    container.current.appendChild(script);
  }, []);

  return (
    <Box
      sx={{
        height: 600,
      }}
    >
      <div
        className="tradingview-widget-container"
        ref={container}
        style={{ height: "100%" }}
      />
    </Box>
  );
}