import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
} from "lightweight-charts";

export default function Chart() {

  const chartRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {

    if (!chartRef.current) return;

    const chart =
      createChart(chartRef.current, {

        width: 1000,

        height: 600,

        layout:{

          background:{
            type:ColorType.Solid,
            color:"#ffffff"
          },

          textColor:"#000"

        }

      });

    const candleSeries =
      chart.addCandlestickSeries();

    candleSeries.setData([]);

    return ()=>chart.remove();

  }, []);

  return(

    <div
      ref={chartRef}
      style={{
        width:"100%",
        height:"600px"
      }}
    />

  );

}