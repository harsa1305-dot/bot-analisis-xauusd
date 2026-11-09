"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineStyle,
  Time,
} from "lightweight-charts";
import {
  AISignalResult,
  Candle,
  KeyLevels,
  LinePoint,
  MarketStructure,
  Timeframe,
} from "@/lib/types";
import {
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  LineChart,
  Maximize2,
  Radio,
  Tv,
} from "lucide-react";

interface GoldChartProps {
  candles: Candle[];
  ema50Series: LinePoint[];
  ema200Series: LinePoint[];
  signal: AISignalResult | null;
  keyLevels: KeyLevels | null;
  structure?: MarketStructure | null;
  timeframe: Timeframe;
  dataSource: string;
  livePrice?: number | null;
  priceDirection?: "UP" | "DOWN" | "IDLE";
}

const TV_INTERVAL_MAP: Record<Timeframe, string> = {
  M5: "5",
  M15: "15",
  H1: "60",
  H4: "240",
};

const TF_SECONDS_MAP: Record<Timeframe, number> = {
  M5: 300,
  M15: 900,
  H1: 3600,
  H4: 14400,
};

export default function GoldChart({
  candles,
  ema50Series,
  ema200Series,
  signal,
  keyLevels,
  structure,
  timeframe,
  dataSource,
  livePrice,
  priceDirection = "IDLE",
}: GoldChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema50LineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lastBarRef = useRef<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  const [chartMode, setChartMode] = useState<"AI_TERMINAL" | "TRADINGVIEW_LIVE">(
    "AI_TERMINAL"
  );
  const [showEma, setShowEma] = useState(true);
  const [showSignalLevels, setShowSignalLevels] = useState(true);
  const [showKeyLevels, setShowKeyLevels] = useState(true);
  const [showStructureMarkers, setShowStructureMarkers] = useState(true);

  // 1. Inisialisasi Chart & Plot Data Historis + Level Garis
  useEffect(() => {
    if (chartMode !== "AI_TERMINAL") return;
    const container = chartContainerRef.current;
    if (!container || candles.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 460,
      layout: {
        background: { type: ColorType.Solid, color: "#0B0F17" },
        textColor: "#94A3B8",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#161F30" },
        horzLines: { color: "#161F30" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#475569",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E293B",
        },
        horzLine: {
          color: "#475569",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E293B",
        },
      },
      rightPriceScale: {
        borderColor: "#1E293B",
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: "#1E293B",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10B981",
      downColor: "#F43F5E",
      borderUpColor: "#10B981",
      borderDownColor: "#F43F5E",
      wickUpColor: "#10B981",
      wickDownColor: "#F43F5E",
    });

    candleSeriesRef.current = candleSeries;

    const formattedCandles = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeries.setData(formattedCandles);

    const last = candles[candles.length - 1];
    lastBarRef.current = {
      time: last.time,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    };

    if (showEma) {
      if (ema50Series.length > 0) {
        const ema50Line = chart.addLineSeries({
          color: "#38BDF8",
          lineWidth: 2,
          title: "EMA 50",
          priceLineVisible: false,
          lastValueVisible: true,
        });
        ema50Line.setData(
          ema50Series.map((p) => ({
            time: p.time as Time,
            value: p.value,
          }))
        );
        ema50LineRef.current = ema50Line;
      }

      if (ema200Series.length > 0) {
        const ema200Line = chart.addLineSeries({
          color: "#F59E0B",
          lineWidth: 2,
          title: "EMA 200",
          priceLineVisible: false,
          lastValueVisible: true,
        });
        ema200Line.setData(
          ema200Series.map((p) => ({
            time: p.time as Time,
            value: p.value,
          }))
        );
      }
    }

    if (showKeyLevels && keyLevels) {
      candleSeries.createPriceLine({
        price: keyLevels.nearestResistance,
        color: "#A855F7",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "RES (Swing High)",
      });

      candleSeries.createPriceLine({
        price: keyLevels.nearestSupport,
        color: "#6366F1",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "SUP (Swing Low)",
      });
    }

    const isSetupCancelled = signal?.tradeStatus === "CANCELLED_INVALIDATED";
    const isTradeClosed =
      signal?.tradeStatus === "CLOSED_TP2" || signal?.tradeStatus === "CLOSED_SL";

    if (showSignalLevels && signal && !isSetupCancelled && !isTradeClosed) {
      const orderTitle =
        signal.orderType === "BUY_LIMIT" || signal.signal === "BUY"
          ? "BUY LIMIT"
          : signal.orderType === "SELL_LIMIT" || signal.signal === "SELL"
          ? "SELL LIMIT"
          : "ZONA PANTAU LIMIT";

      candleSeries.createPriceLine({
        price: signal.entryPrice,
        color: "#38BDF8",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: orderTitle,
      });

      if (
        signal.entryZoneLow &&
        signal.entryZoneHigh &&
        Math.abs(signal.entryZoneHigh - signal.entryZoneLow) >= 0.3
      ) {
        candleSeries.createPriceLine({
          price: signal.entryZoneLow,
          color: "#0284C7",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: "Zona Limit Low",
        });
        candleSeries.createPriceLine({
          price: signal.entryZoneHigh,
          color: "#0284C7",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: "Zona Limit High",
        });
      }

      candleSeries.createPriceLine({
        price: signal.stopLoss,
        color: "#F43F5E",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "STOP LOSS (Di Luar Zona + ATR)",
      });

      candleSeries.createPriceLine({
        price: signal.tp1,
        color: "#10B981",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TP 1 (Swing Liquidity)",
      });

      candleSeries.createPriceLine({
        price: signal.tp2,
        color: "#34D399",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "TP 2 (Major Swing)",
      });
    }

    if (showStructureMarkers && structure) {
      const markers: Array<{
        time: Time;
        position: "aboveBar" | "belowBar";
        color: string;
        shape: "arrowUp" | "arrowDown" | "circle";
        text: string;
      }> = [];

      if (structure.recentSweeps && structure.recentSweeps.length > 0) {
        for (const sw of structure.recentSweeps) {
          if (sw.time) {
            markers.push({
              time: sw.time as Time,
              position: sw.side === "SELL_SIDE" ? "belowBar" : "aboveBar",
              color: sw.side === "SELL_SIDE" ? "#10B981" : "#F43F5E",
              shape: sw.side === "SELL_SIDE" ? "arrowUp" : "arrowDown",
              text: `SWEEP ${sw.side === "SELL_SIDE" ? "LOW" : "HIGH"}`,
            });
          }
        }
      }

      if (structure.lastBreak && structure.lastBreak.time) {
        markers.push({
          time: structure.lastBreak.time as Time,
          position:
            structure.lastBreak.direction === "BULLISH"
              ? "aboveBar"
              : "belowBar",
          color:
            structure.lastBreak.direction === "BULLISH" ? "#38BDF8" : "#FB7185",
          shape: "circle",
          text: `${structure.lastBreak.type} ${structure.lastBreak.direction}`,
        });
      }

      markers.sort((a, b) => Number(a.time) - Number(b.time));
      if (markers.length > 0) {
        candleSeries.setMarkers(markers);
      }
    }

    const handleResize = () => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      ema50LineRef.current = null;
    };
  }, [
    chartMode,
    candles,
    ema50Series,
    ema200Series,
    signal,
    keyLevels,
    structure,
    showEma,
    showSignalLevels,
    showKeyLevels,
    showStructureMarkers,
  ]);

  // 2. Efek Live Tick Real-Time: Menggerakkan batang candlestick terakhir secara hidup setiap 2 detik
  useEffect(() => {
    if (
      chartMode !== "AI_TERMINAL" ||
      !candleSeriesRef.current ||
      !lastBarRef.current ||
      !livePrice ||
      livePrice <= 0
    ) {
      return;
    }

    const tfSeconds = TF_SECONDS_MAP[timeframe];
    const currentBucketTime = Math.floor(Date.now() / 1000 / tfSeconds) * tfSeconds;
    const prevBar = lastBarRef.current;

    if (currentBucketTime > prevBar.time) {
      // Membentuk batang candle baru ketika waktu melintasi batas timeframe
      const newBar = {
        time: currentBucketTime,
        open: prevBar.close,
        high: Math.max(prevBar.close, livePrice),
        low: Math.min(prevBar.close, livePrice),
        close: livePrice,
      };
      lastBarRef.current = newBar;
      candleSeriesRef.current.update({
        time: newBar.time as Time,
        open: newBar.open,
        high: newBar.high,
        low: newBar.low,
        close: newBar.close,
      });
    } else {
      // Menggerakkan batang candle aktif saat ini naik/turun sesuai harga global
      const updatedBar = {
        time: prevBar.time,
        open: prevBar.open,
        high: Number(Math.max(prevBar.high, livePrice).toFixed(2)),
        low: Number(Math.min(prevBar.low, livePrice).toFixed(2)),
        close: Number(livePrice.toFixed(2)),
      };
      lastBarRef.current = updatedBar;
      candleSeriesRef.current.update({
        time: updatedBar.time as Time,
        open: updatedBar.open,
        high: updatedBar.high,
        low: updatedBar.low,
        close: updatedBar.close,
      });
    }
  }, [livePrice, timeframe, chartMode]);

  const handleFitContent = () => {
    chartRef.current?.timeScale().fitContent();
  };

  const tvEmbedUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_xauusd&symbol=OANDA%3AXAUUSD&interval=${TV_INTERVAL_MAP[timeframe]}&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0B0F17&studies=%5B%22RSI%40tv-basicstudies%22%5D&theme=dark&style=1&timezone=Asia%2FJakarta&withdateranges=1&showpopupbutton=0&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=id`;

  const displayPrice =
    livePrice ?? candles[candles.length - 1]?.close ?? signal?.currentPrice;

  return (
    <div className="bg-[#111621] border border-[#1E2738] rounded-xl overflow-hidden shadow-xl">
      {/* Header Toolbar Chart */}
      <div className="px-4 py-3 border-b border-[#1E2738] flex flex-wrap items-center justify-between gap-2 bg-[#0D121B]">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono font-bold text-sm text-white tracking-wide">
              XAU/USD • {timeframe} LIVE
            </span>
          </div>

          {displayPrice && (
            <span
              className={`text-xs font-mono font-extrabold px-2.5 py-0.5 rounded border transition-colors duration-300 flex items-center gap-1.5 ${
                priceDirection === "UP"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                  : priceDirection === "DOWN"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                  : "bg-slate-800/90 text-amber-300 border-slate-700"
              }`}
            >
              <Radio className="w-3 h-3 animate-pulse" />$
              {displayPrice.toFixed(2)}
            </span>
          )}

          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            {dataSource}
          </span>

          {/* Switcher Mode Chart: AI Signal Chart vs Official TradingView OANDA:XAUUSD */}
          <div className="flex items-center bg-[#090D14] p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setChartMode("AI_TERMINAL")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                chartMode === "AI_TERMINAL"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LineChart className="w-3 h-3" />
              AI Level Chart (Live Tick)
            </button>
            <button
              type="button"
              onClick={() => setChartMode("TRADINGVIEW_LIVE")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                chartMode === "TRADINGVIEW_LIVE"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Tv className="w-3 h-3" />
              TradingView Live (OANDA)
            </button>
          </div>
        </div>

        {/* Tombol Toggle Layer Visual di Chart */}
        {chartMode === "AI_TERMINAL" && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowEma((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
                showEma
                  ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
                  : "bg-slate-800/50 text-slate-500 border-slate-700/50"
              }`}
            >
              {showEma ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              EMA 50/200
            </button>

            <button
              type="button"
              onClick={() => setShowSignalLevels((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
                showSignalLevels
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-800/50 text-slate-500 border-slate-700/50"
              }`}
            >
              {showSignalLevels ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              Garis Entry/SL/TP
            </button>

            <button
              type="button"
              onClick={() => setShowKeyLevels((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
                showKeyLevels
                  ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
                  : "bg-slate-800/50 text-slate-500 border-slate-700/50"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Sup/Res
            </button>

            <button
              type="button"
              onClick={() => setShowStructureMarkers((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
                showStructureMarkers
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                  : "bg-slate-800/50 text-slate-500 border-slate-700/50"
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              SMC Sweep/BOS
            </button>

            <button
              type="button"
              onClick={handleFitContent}
              title="Reset Zoom Chart"
              className="p-1.5 rounded bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Legend Bar */}
      <div className="px-4 py-1.5 bg-[#090D14] border-b border-[#161F30] flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-400 inline-block" /> EMA 50:{" "}
          <strong className="text-sky-300">
            {ema50Series[ema50Series.length - 1]?.value.toFixed(2) ?? "-"}
          </strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-amber-400 inline-block" /> EMA 200:{" "}
          <strong className="text-amber-300">
            {ema200Series[ema200Series.length - 1]?.value.toFixed(2) ?? "-"}
          </strong>
        </span>
        {signal &&
          (signal.tradeStatus === "CANCELLED_INVALIDATED" ? (
            <span className="flex items-center gap-1.5 text-rose-300 bg-rose-500/10 px-2.5 py-0.5 rounded border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              Setup Limit Sebelumnya Dibatalkan (Target Lari) • Garis Dibersihkan dari Layar
            </span>
          ) : signal.tradeStatus === "CLOSED_TP2" || signal.tradeStatus === "CLOSED_TP1" ? (
            <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Trade Selesai (Take Profit Hit) • Menunggu Setup Baru
            </span>
          ) : signal.tradeStatus === "CLOSED_SL" ? (
            <span className="flex items-center gap-1.5 text-rose-300 bg-rose-500/10 px-2.5 py-0.5 rounded border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              Trade Selesai (Stop Loss Hit) • Menunggu Setup Baru
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />{" "}
                {signal.orderType === "BUY_LIMIT" || signal.signal === "BUY"
                  ? "Buy Limit:"
                  : signal.orderType === "SELL_LIMIT" || signal.signal === "SELL"
                  ? "Sell Limit:"
                  : "Zona Pantau:"}{" "}
                <strong className="text-white">{signal.entryPrice.toFixed(2)}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> SL:{" "}
                <strong className="text-rose-400">{signal.stopLoss.toFixed(2)}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> TP1:{" "}
                <strong className="text-emerald-400">{signal.tp1.toFixed(2)}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-300 inline-block" /> TP2:{" "}
                <strong className="text-emerald-300">{signal.tp2.toFixed(2)}</strong>
              </span>
            </>
          ))}
      </div>

      {/* Canvas Container or Official TradingView Live Embed */}
      {chartMode === "AI_TERMINAL" ? (
        <div ref={chartContainerRef} className="w-full h-[460px]" />
      ) : (
        <div className="w-full h-[460px] bg-[#0B0F17]">
          <iframe
            title="TradingView OANDA:XAUUSD Live Chart"
            src={tvEmbedUrl}
            className="w-full h-full border-0"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
