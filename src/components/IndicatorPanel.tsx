"use client";

import React, { useState } from "react";
import { Candle, PreProcessedMarketData } from "@/lib/types";
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Code2,
  Compass,
  Flame,
  GitCommitHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface IndicatorPanelProps {
  marketData: PreProcessedMarketData | null;
  candles?: Candle[];
}

export default function IndicatorPanel({
  marketData,
  candles = [],
}: IndicatorPanelProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!marketData) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 bg-[#111621] border border-[#1E2738] rounded-xl"
          />
        ))}
      </div>
    );
  }

  const { indicators, keyLevels, recentCandles, currentPrice, timeframe } =
    marketData;
  const isBullTrend =
    indicators.trendAlignment === "STRONG_BULLISH" ||
    indicators.trendAlignment === "BULLISH_PULLBACK";
  const isBearTrend =
    indicators.trendAlignment === "STRONG_BEARISH" ||
    indicators.trendAlignment === "BEARISH_PULLBACK";

  // Format identik dengan output `td.time_series(symbol="XAU/USD", interval=..., outputsize=12).as_json()`
  const twelveDataTimeSeriesPreview = candles
    .slice(-12)
    .reverse()
    .map((c) => ({
      datetime: c.isoTime.replace("T", " ").replace(/\.\d+Z$/, ""),
      open: c.open.toFixed(2),
      high: c.high.toFixed(2),
      low: c.low.toFixed(2),
      close: c.close.toFixed(2),
    }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. TREN & EMA (EMA 50 & EMA 200) */}
        <div className="bg-[#111621] border border-[#1E2738] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-sky-400" />
              STRUKTUR EMA (50 / 200)
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isBullTrend
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : isBearTrend
                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              }`}
            >
              {indicators.trendAlignment.replace("_", " ")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 my-2">
            <div className="bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] font-mono text-sky-400">EMA 50 (Fast)</div>
              <div className="text-base font-mono font-bold text-white">
                ${indicators.ema50.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {currentPrice >= indicators.ema50 ? "Di Atas EMA50" : "Di Bawah EMA50"}
              </div>
            </div>

            <div className="bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] font-mono text-amber-400">
                EMA 200 (Major)
              </div>
              <div className="text-base font-mono font-bold text-white">
                ${indicators.ema200.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {currentPrice >= indicators.ema200
                  ? "Di Atas EMA200"
                  : "Di Bawah EMA200"}
              </div>
            </div>
          </div>
          <p className="text-[11px] font-mono text-slate-400 truncate">
            {indicators.trendDescription}
          </p>
        </div>

        {/* 2. MOMENTUM RSI (14) */}
        <div className="bg-[#111621] border border-[#1E2738] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-purple-400" />
              MOMENTUM RSI (14)
            </span>
            <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px]">
              {indicators.rsiZone.replace("_", " ")}
            </span>
          </div>

          <div className="flex items-baseline justify-between my-2">
            <div className="text-3xl font-mono font-extrabold text-white">
              {indicators.rsi14.toFixed(1)}
            </div>
            <div className="flex items-center gap-1 text-xs font-mono">
              {indicators.rsiSlope === "RISING" ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> NAIK (RISING)
                </span>
              ) : indicators.rsiSlope === "FALLING" ? (
                <span className="text-rose-400 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" /> TURUN (FALLING)
                </span>
              ) : (
                <span className="text-slate-400">MENDATAR (FLAT)</span>
              )}
            </div>
          </div>

          <div className="relative w-full h-2.5 bg-[#0B0F17] rounded-full overflow-hidden border border-slate-800 my-2">
            <div
              className="absolute top-0 bottom-0 bg-slate-800/70 border-x border-slate-600/60"
              style={{ left: "30%", width: "40%" }}
            />
            <div
              className={`h-full transition-all duration-500 ${
                indicators.rsi14 >= 70
                  ? "bg-rose-500"
                  : indicators.rsi14 <= 30
                  ? "bg-emerald-500"
                  : "bg-purple-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, indicators.rsi14))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>Oversold (&lt;30)</span>
            <span>Netral (50)</span>
            <span>Overbought (&gt;70)</span>
          </div>
        </div>

        {/* 3. VOLATILITAS ATR (14) & STOP-HUNT BUFFER */}
        <div className="bg-[#111621] border border-[#1E2738] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              VOLATILITAS ATR (14)
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
              {indicators.volatilityState.replace("_", " ")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 my-2">
            <div className="bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400">
                Range per Candle
              </div>
              <div className="text-lg font-mono font-bold text-amber-400">
                ±${indicators.atr14.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                ({Math.round(indicators.atr14 * 10)} pips)
              </div>
            </div>

            <div className="bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] font-mono text-rose-400">
                Safe SL Buffer
              </div>
              <div className="text-lg font-mono font-bold text-white">
                ±${keyLevels.safeSlBuffer.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                1.5x ATR (Anti-Sweep)
              </div>
            </div>
          </div>

          <p className="text-[11px] font-mono text-slate-400 truncate">
            Jarak SL minimal disarankan {Math.round(keyLevels.safeSlBuffer * 10)} pips
          </p>
        </div>

        {/* 4. KEY LEVELS: SWING HIGH (RES) & SWING LOW (SUP) */}
        <div className="bg-[#111621] border border-[#1E2738] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              KEY LEVELS (SWING H/L)
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              100-Bar Fractal
            </span>
          </div>

          <div className="space-y-2 my-1.5">
            <div className="flex items-center justify-between bg-[#0B0F17] px-3 py-2 rounded-lg border border-rose-500/25">
              <div>
                <div className="text-[10px] font-mono text-rose-400 uppercase">
                  Nearest Resistance (Swing High)
                </div>
                <div className="text-sm font-mono font-bold text-white">
                  ${keyLevels.nearestResistance.toFixed(2)}
                </div>
              </div>
              <span className="text-xs font-mono text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded">
                +{keyLevels.distanceToResistance.toFixed(2)} pts
              </span>
            </div>

            <div className="flex items-center justify-between bg-[#0B0F17] px-3 py-2 rounded-lg border border-emerald-500/25">
              <div>
                <div className="text-[10px] font-mono text-emerald-400 uppercase">
                  Nearest Support (Swing Low)
                </div>
                <div className="text-sm font-mono font-bold text-white">
                  ${keyLevels.nearestSupport.toFixed(2)}
                </div>
              </div>
              <span className="text-xs font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded">
                -{keyLevels.distanceToSupport.toFixed(2)} pts
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Baris Ringkasan Price Action 5 Candle Terakhir + Tombol Lihat Struktur JSON Twelve Data */}
      <div className="bg-[#111621] border border-[#1E2738] rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <GitCommitHorizontal className="w-4 h-4 text-amber-400" />
            <span>SCANNER PRICE ACTION (5 CANDLE TERAKHIR):</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {recentCandles.map((c, idx) => {
              const isBull = c.close >= c.open;
              return (
                <div
                  key={idx}
                  className={`px-2.5 py-1 rounded border text-[11px] font-mono flex items-center gap-2 ${
                    isBull
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}
                >
                  <span className="opacity-75">
                    {new Date(c.time).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <strong>${c.close.toFixed(2)}</strong>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30">
                    {c.pattern.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setShowRawJson((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[11px] font-mono transition"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Struktur time_series JSON (12 Bar)</span>
              {showRawJson ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {showRawJson && (
          <div className="border-t border-[#1E2738] bg-[#080B11] p-4 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-[11px]">
              <span>
                Struktur Market Data (Setara{" "}
                <code className="text-amber-300">
                  td.time_series(symbol=&quot;XAU/USD&quot;, interval=&quot;{timeframe}&quot;,
                  outputsize=12).as_json()
                </code>
                )
              </span>
              <span className="text-sky-400">{marketData.dataSource}</span>
            </div>
            <pre className="max-h-56 overflow-y-auto p-3 rounded-lg bg-[#05070B] border border-slate-800 text-emerald-300 text-[11px] leading-relaxed">
              {JSON.stringify(twelveDataTimeSeriesPreview, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
