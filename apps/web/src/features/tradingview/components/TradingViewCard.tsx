import { Card, CardContent, Typography } from "@mui/material";
import { useEffect, useRef } from "react";

export default function TradingViewCard() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    container.current.innerHTML = "";

    const script = document.createElement("script");

    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

    script.type = "text/javascript";
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
      save_image: false,
      studies: [],
    });

    container.current.appendChild(script);
  }, []);

  return (
    <Card sx={{ height: 700 }}>
      <CardContent sx={{ height: "100%" }}>
        <Typography variant="h6" gutterBottom>
          XAUUSD TradingView
        </Typography>

        <div
          className="tradingview-widget-container"
          style={{
            height: "620px",
            width: "100%",
          }}
        >
          <div
            ref={container}
            className="tradingview-widget-container__widget"
            style={{
              height: "100%",
              width: "100%",
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}