"use client";

import React, { useState } from "react";
import { AISignalResult } from "@/lib/types";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  BrainCircuit,
  Calculator,
  CalendarClock,
  Check,
  Copy,
  Crosshair,
  PauseCircle,
  Radio,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";

interface SignalCardProps {
  signal: AISignalResult | null;
  loading: boolean;
  livePrice?: number | null;
}

export default function SignalCard({
  signal,
  loading,
  livePrice,
}: SignalCardProps) {
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<number>(1000);
  const [riskPercent, setRiskPercent] = useState<number>(1);

  if (!signal) {
    return (
      <div className="bg-[#111621] border border-[#1E2738] rounded-xl p-6 animate-pulse h-full">
        <div className="h-7 w-40 bg-slate-800 rounded mb-4" />
        <div className="h-24 bg-slate-800/70 rounded-lg mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="h-16 bg-slate-800/70 rounded" />
          <div className="h-16 bg-slate-800/70 rounded" />
        </div>
        <div className="h-32 bg-slate-800/70 rounded" />
      </div>
    );
  }

  const isBuy = signal.signal === "BUY";
  const isSell = signal.signal === "SELL";
  const isCancelled = signal.tradeStatus === "CANCELLED_INVALIDATED";
  const isClosed =
    signal.tradeStatus === "CLOSED_TP2" || signal.tradeStatus === "CLOSED_SL";

  const orderTypeLabel = isCancelled
    ? "SETUP BATAL (TARGET LARI)"
    : isClosed
    ? signal.tradeStatus === "CLOSED_TP2"
      ? "TRADE SELESAI (TP HIT)"
      : "TRADE SELESAI (SL HIT)"
    : signal.orderType === "BUY_LIMIT"
    ? "BUY LIMIT"
    : signal.orderType === "SELL_LIMIT"
    ? "SELL LIMIT"
    : isBuy
    ? "BUY LIMIT"
    : isSell
    ? "SELL LIMIT"
    : "WAIT (NO ORDER)";

  const spotNow = livePrice && livePrice > 0 ? livePrice : signal.currentPrice;
  const zoneLow = signal.entryZoneLow ?? signal.entryPrice;
  const zoneHigh = signal.entryZoneHigh ?? signal.entryPrice;

  // Hitung status real-time untuk Pending Limit Order (Menunggu Jemputan vs Terisi vs Batal)
  const rawDiff = isBuy
    ? spotNow - signal.entryPrice
    : isSell
    ? signal.entryPrice - spotNow
    : spotNow - signal.entryPrice;
  const floatingPips = Math.round(rawDiff * 10);

  let liveStatusLabel = "";
  let liveStatusColor =
    "bg-sky-500/15 text-sky-300 border-sky-500/40";

  if (isCancelled) {
    liveStatusLabel = `🚫 SETUP BATAL: Harga sentuh Cancel Level ($${
      signal.cancelLevel?.toFixed(2) ?? spotNow.toFixed(2)
    }) sebelum terisi. Menunggu setup baru...`;
    liveStatusColor = "bg-rose-500/20 text-rose-300 border-rose-500/40";
  } else if (signal.tradeStatus === "CLOSED_TP2" || signal.tradeStatus === "CLOSED_TP1") {
    liveStatusLabel = `🏆 TAKE PROFIT TERCAPAI (+${
      signal.realizedPips ?? signal.tp2Pips
    } Pips)! Trade selesai.`;
    liveStatusColor = "bg-emerald-500/25 text-emerald-200 border-emerald-400";
  } else if (signal.tradeStatus === "CLOSED_SL") {
    liveStatusLabel = `🛡️ STOP LOSS TERSENTUH (${
      signal.realizedPips ?? -signal.slPips
    } Pips). Risiko terkontrol.`;
    liveStatusColor = "bg-rose-500/25 text-rose-200 border-rose-400";
  } else if (isBuy) {
    if (spotNow <= signal.stopLoss) {
      liveStatusLabel = `⚠️ SL TERSENTUH ($${signal.stopLoss.toFixed(2)})`;
      liveStatusColor = "bg-rose-500/25 text-rose-200 border-rose-400";
    } else if (spotNow <= zoneHigh && spotNow >= zoneLow) {
      liveStatusLabel = `🟢 ZONA BUY LIMIT TERSENTUH! (${
        floatingPips >= 0 ? "+" : ""
      }${floatingPips} Pips)`;
      liveStatusColor = "bg-emerald-500/25 text-emerald-200 border-emerald-400";
    } else if (spotNow < zoneLow) {
      liveStatusLabel = `🟢 ORDER AKTIF DI ZONA DISKON (${floatingPips} Pips)`;
      liveStatusColor = "bg-amber-500/20 text-amber-200 border-amber-400/60";
    } else if (signal.cancelLevel && spotNow >= signal.cancelLevel) {
      liveStatusLabel = `🚫 BATAL: Harga sentuh Cancel Level ($${signal.cancelLevel.toFixed(
        2
      )})`;
      liveStatusColor = "bg-rose-500/20 text-rose-300 border-rose-500/40";
    } else {
      const distPts = Math.max(0, spotNow - signal.entryPrice);
      const distPips = Math.round(distPts * 10);
      liveStatusLabel = `⏳ Menunggu Pullback -${distPts.toFixed(
        2
      )} pts (${distPips} pips) ke Limit`;
      liveStatusColor = "bg-sky-500/15 text-sky-300 border-sky-500/40";
    }
  } else if (isSell) {
    if (spotNow >= signal.stopLoss) {
      liveStatusLabel = `⚠️ SL TERSENTUH ($${signal.stopLoss.toFixed(2)})`;
      liveStatusColor = "bg-rose-500/25 text-rose-200 border-rose-400";
    } else if (spotNow >= zoneLow && spotNow <= zoneHigh) {
      liveStatusLabel = `🟢 ZONA SELL LIMIT TERSENTUH! (${
        floatingPips >= 0 ? "+" : ""
      }${floatingPips} Pips)`;
      liveStatusColor = "bg-emerald-500/25 text-emerald-200 border-emerald-400";
    } else if (spotNow > zoneHigh) {
      liveStatusLabel = `🟢 ORDER AKTIF DI ZONA PREMIUM (${floatingPips} Pips)`;
      liveStatusColor = "bg-amber-500/20 text-amber-200 border-amber-400/60";
    } else if (signal.cancelLevel && spotNow <= signal.cancelLevel) {
      liveStatusLabel = `🚫 BATAL: Harga sentuh Cancel Level ($${signal.cancelLevel.toFixed(
        2
      )})`;
      liveStatusColor = "bg-rose-500/20 text-rose-300 border-rose-500/40";
    } else {
      const distPts = Math.max(0, signal.entryPrice - spotNow);
      const distPips = Math.round(distPts * 10);
      liveStatusLabel = `⏳ Menunggu Rally +${distPts.toFixed(
        2
      )} pts (${distPips} pips) ke Limit`;
      liveStatusColor = "bg-sky-500/15 text-sky-300 border-sky-500/40";
    }
  } else {
    const distPts = Math.abs(spotNow - signal.entryPrice);
    liveStatusLabel = `⏸️ WAIT • Jarak ke Zona Pantau: ${distPts.toFixed(
      2
    )} pts (${Math.round(distPts * 10)} pips)`;
    liveStatusColor = "bg-amber-500/15 text-amber-300 border-amber-500/40";
  }

  const badgeStyle = isCancelled
    ? "bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-[0_0_25px_rgba(244,63,94,0.15)]"
    : isBuy
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.2)]"
    : isSell
    ? "bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-[0_0_25px_rgba(244,63,94,0.2)]"
    : "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.15)]";

  const progressColor = isBuy
    ? "bg-emerald-500"
    : isSell
    ? "bg-rose-500"
    : "bg-amber-500";

  const riskUsd = Math.max(0, (balance * riskPercent) / 100);
  const slPoints = Math.max(Math.abs(signal.entryPrice - signal.stopLoss), 0.5);
  const rawLots = riskUsd / (slPoints * 100);
  const recommendedLot = Math.max(0.01, Math.round(rawLots * 100) / 100);
  const estProfitTp1 = Math.round(
    Math.abs(signal.tp1 - signal.entryPrice) * 100 * recommendedLot
  );
  const estProfitTp2 = Math.round(
    Math.abs(signal.tp2 - signal.entryPrice) * 100 * recommendedLot
  );

  const handleCopySetup = () => {
    const text = [
      `📊 XAU/USD AI PENDING LIMIT SIGNAL (${signal.timeframe})`,
      `Engine: ${signal.aiModelName || signal.aiEngine}`,
      `Order: ${orderTypeLabel} (Confidence: ${signal.confidence}%)`,
      signal.setupType ? `Setup Momen: ${signal.setupType}` : null,
      `Harga Saat Ini: $${spotNow.toFixed(2)}`,
      `Harga Limit Entry: $${signal.entryPrice.toFixed(2)} (Zona: $${zoneLow.toFixed(
        2
      )} - $${zoneHigh.toFixed(2)})`,
      `Stop Loss (SL): $${signal.stopLoss.toFixed(2)} (${signal.slPips} pips - Di luar Zona + ATR)`,
      `Take Profit 1 (TP1): $${signal.tp1.toFixed(2)} (+${signal.tp1Pips} pips)`,
      `Take Profit 2 (TP2): $${signal.tp2.toFixed(2)} (+${signal.tp2Pips} pips)`,
      signal.cancelLevel
        ? `Batal Jika Harga Sentuh (Cancel Level): $${signal.cancelLevel.toFixed(2)}`
        : null,
      `Rekomendasi Lot ($${balance} @ ${riskPercent}%): ${recommendedLot.toFixed(2)} Lot`,
      `Risk:Reward: ${signal.riskRewardRatio}`,
      `Bias: ${signal.marketBias}`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#111621] border border-[#1E2738] rounded-xl overflow-hidden shadow-xl flex flex-col justify-between">
      {/* Top Header */}
      <div className="px-5 py-3.5 border-b border-[#1E2738] bg-[#0D121B] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
            Eksekusi Limit Order AI ({signal.timeframe})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              signal.aiEngine === "OLLAMA_LOCAL"
                ? "bg-purple-500/15 text-purple-300 border-purple-500/30 font-bold"
                : signal.aiEngine === "OPENAI_GPT"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : signal.aiEngine === "GEMINI_2_5_FLASH"
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-sky-500/15 text-sky-300 border-sky-500/30"
            }`}
          >
            {signal.aiEngine === "OLLAMA_LOCAL"
              ? `🦙 ${signal.aiModelName || "Ollama Local AI"}`
              : signal.aiEngine === "OPENAI_GPT"
              ? `⚡ ${signal.aiModelName || "OpenAI GPT"}`
              : signal.aiEngine === "GEMINI_2_5_FLASH"
              ? "⚡ Gemini 2.5 Flash"
              : `🧮 ${signal.aiModelName || "SMC Structure Engine"}`}
          </span>

          <button
            type="button"
            onClick={handleCopySetup}
            className="flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Limit</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Kartu Status Sinyal Utama (BUY LIMIT / SELL LIMIT / WAIT) & Confidence */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition ${badgeStyle} ${
            loading ? "opacity-60" : "opacity-100"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-lg ${
                isBuy
                  ? "bg-emerald-500/20 text-emerald-300"
                  : isSell
                  ? "bg-rose-500/20 text-rose-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {isBuy ? (
                <ArrowUpRight className="w-7 h-7" />
              ) : isSell ? (
                <ArrowDownRight className="w-7 h-7" />
              ) : (
                <PauseCircle className="w-7 h-7" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                <span>Tipe Order Rekomendasi</span>
                {signal.confluenceScore !== undefined && (
                  <span className="px-1.5 py-0.2 rounded bg-black/30 text-[10px]">
                    Skor {signal.confluenceScore}/100
                  </span>
                )}
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-extrabold tracking-tight">
                {orderTypeLabel}
              </div>
              <div className="text-xs font-mono opacity-90 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <Crosshair className="w-3 h-3 shrink-0" />
                <span>{signal.setupType || signal.marketBias}</span>
              </div>
            </div>
          </div>

          {/* Confidence Meter */}
          <div className="text-right min-w-[110px]">
            <div className="text-[11px] font-mono uppercase tracking-wider opacity-80">
              AI Confidence
            </div>
            <div className="text-2xl font-mono font-bold">
              {signal.confidence}%
            </div>
            <div className="w-24 sm:w-28 h-2 bg-slate-900/80 rounded-full overflow-hidden mt-1.5 border border-white/10 ml-auto">
              <div
                className={`h-full ${progressColor} transition-all duration-500`}
                style={{ width: `${signal.confidence}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live Pending Limit Order Tracker Bar */}
        <div
          className={`px-3.5 py-2 rounded-lg border font-mono text-xs flex flex-wrap items-center justify-between gap-2 ${liveStatusColor}`}
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Spot: ${spotNow.toFixed(2)}
          </span>
          <span className="font-bold">{liveStatusLabel}</span>
        </div>

        {/* Grid Level Eksekusi: Harga Limit, Stop Loss, TP1, TP2 */}
        <div className="grid grid-cols-2 gap-3">
          {/* ENTRY LIMIT LEVEL */}
          <div className="bg-[#0B0F17] border border-sky-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-sky-400 mb-1">
              <span>
                {signal.signal === "WAIT"
                  ? "ZONA PANTAU LIMIT"
                  : `${signal.orderType === "BUY_LIMIT" ? "BUY LIMIT" : signal.orderType === "SELL_LIMIT" ? "SELL LIMIT" : orderTypeLabel} @`}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-[10px]">
                RR {signal.riskRewardRatio}
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white">
              ${signal.entryPrice.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              Zona: ${zoneLow.toFixed(2)} – ${zoneHigh.toFixed(2)}
            </div>
          </div>

          {/* STOP LOSS LEVEL */}
          <div className="bg-[#0B0F17] border border-rose-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-rose-400 mb-1">
              <span className="flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> STOP LOSS (SL)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-[10px]">
                -{signal.slPips} pips
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-rose-400">
              ${signal.stopLoss.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              Di Luar Zona OB/FVG + ATR
            </div>
          </div>

          {/* TAKE PROFIT 1 */}
          <div className="bg-[#0B0F17] border border-emerald-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 mb-1">
              <span className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5" /> TAKE PROFIT 1 (TP1)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[10px]">
                +{signal.tp1Pips} pips
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-emerald-400">
              ${signal.tp1.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              Target Swing 1 (+${estProfitTp1})
            </div>
          </div>

          {/* TAKE PROFIT 2 */}
          <div className="bg-[#0B0F17] border border-emerald-400/40 rounded-lg p-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-emerald-300 mb-1">
              <span className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5" /> TAKE PROFIT 2 (TP2)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-400/15 text-[10px]">
                +{signal.tp2Pips} pips
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-emerald-300">
              ${signal.tp2.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              Major Liquidity (+${estProfitTp2})
            </div>
          </div>
        </div>

        {/* Info Pembatalan Order (Cancel Level) & Status News */}
        {(signal.cancelLevel || signal.newsPhase) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
            {signal.cancelLevel && (
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Ban className="w-3.5 h-3.5 text-amber-400" />
                  Batal Tanpa Fill:
                </span>
                <strong className="text-amber-300">
                  ${signal.cancelLevel.toFixed(2)}{" "}
                  {signal.expiresInCandles
                    ? `(${signal.expiresInCandles}c)`
                    : ""}
                </strong>
              </div>
            )}

            {signal.newsPhase && (
              <div className="bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <CalendarClock className="w-3.5 h-3.5 text-sky-400" />
                  Fase News:
                </span>
                <strong
                  className={
                    signal.newsPhase === "CLEAR"
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {signal.newsPhase}
                </strong>
              </div>
            )}
          </div>
        )}

        {/* Skenario Alternatif Pasar 2 Arah (Dual-Direction Setup) */}
        {signal.alternativeSetup && (
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-3.5 space-y-2 font-mono">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Skenario Alternatif (Dual-Direction):{" "}
                <span
                  className={
                    signal.alternativeSetup.orderType === "BUY_LIMIT"
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {signal.alternativeSetup.orderType === "BUY_LIMIT"
                    ? "BUY LIMIT"
                    : "SELL LIMIT"}
                </span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Skor {signal.alternativeSetup.score}/100 • RR 1:
                {signal.alternativeSetup.rr1}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-[#111621] p-2 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Entry Limit</div>
                <div className="font-bold text-sky-400">
                  ${signal.alternativeSetup.entry.toFixed(2)}
                </div>
              </div>
              <div className="bg-[#111621] p-2 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Stop Loss</div>
                <div className="font-bold text-rose-400">
                  ${signal.alternativeSetup.stopLoss.toFixed(2)}
                </div>
              </div>
              <div className="bg-[#111621] p-2 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Target TP1</div>
                <div className="font-bold text-emerald-400">
                  ${signal.alternativeSetup.tp1.toFixed(2)}
                </div>
              </div>
              <div className="bg-[#111621] p-2 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Target TP2</div>
                <div className="font-bold text-emerald-300">
                  ${signal.alternativeSetup.tp2.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              Setup: {signal.alternativeSetup.setupType} • Batal jika sentuh $
              {signal.alternativeSetup.cancelLevel?.toFixed(2)}
            </div>
          </div>
        )}

        {/* Kalkulator Lot & Risiko Otomatis untuk Eksekusi Manual */}
        <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-3.5 font-mono text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] text-sky-400 font-semibold uppercase">
              <Calculator className="w-3.5 h-3.5" /> Kalkulator Lot Limit Order
            </span>
            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              Rekomendasi: {recommendedLot.toFixed(2)} Lot
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                Modal Akun ($)
              </label>
              <input
                type="number"
                min={50}
                step={50}
                value={balance}
                onChange={(e) => setBalance(Math.max(10, Number(e.target.value)))}
                className="w-full px-2.5 py-1 rounded bg-[#111621] border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                Risiko / Trade (%)
              </label>
              <input
                type="number"
                min={0.25}
                max={10}
                step={0.25}
                value={riskPercent}
                onChange={(e) =>
                  setRiskPercent(Math.max(0.1, Number(e.target.value)))
                }
                className="w-full px-2.5 py-1 rounded bg-[#111621] border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                Risiko Maks ($)
              </label>
              <div className="px-2.5 py-1 rounded bg-[#111621] border border-rose-500/30 text-rose-400 font-bold text-xs">
                -${riskUsd.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Kotak Teks Rasionalisasi Analisa Momen & News dari AI */}
        <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Rasionalisasi Momen & News AI</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {new Date(signal.timestamp).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              WIB
            </span>
          </div>

          <p className="text-sm text-slate-200 leading-relaxed">
            {signal.reasoning}
          </p>

          {signal.newsImpact && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs font-mono text-amber-200">
              <strong className="text-amber-400">Analisis Dampak News: </strong>
              {signal.newsImpact}
            </div>
          )}

          {signal.keyFactors && signal.keyFactors.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase">
                Faktor Konfluensi Momen & Struktur:
              </div>
              <ul className="space-y-1">
                {signal.keyFactors.map((factor, idx) => (
                  <li
                    key={idx}
                    className="text-xs font-mono text-slate-300 flex items-start gap-2"
                  >
                    <span className="text-amber-400 mt-0.5">▸</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
