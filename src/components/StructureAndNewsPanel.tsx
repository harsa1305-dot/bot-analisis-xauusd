"use client";

import React from "react";
import {
  AISignalResult,
  LimitCandidate,
  MarketStructure,
  NewsContext,
} from "@/lib/types";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Crosshair,
  Flame,
  Layers,
  Radar,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

interface StructureAndNewsPanelProps {
  structure: MarketStructure | null | undefined;
  news: NewsContext | null | undefined;
  currentPrice: number;
  activeSignal: AISignalResult | null;
  onSelectCandidate?: (candidate: LimitCandidate) => void;
}

export default function StructureAndNewsPanel({
  structure,
  news,
  currentPrice,
  activeSignal,
  onSelectCandidate,
}: StructureAndNewsPanelProps) {
  if (!structure) return null;

  const isBullStructure = structure.trend === "BULLISH";
  const isBearStructure = structure.trend === "BEARISH";

  const phaseBadge = (() => {
    const phase = news?.phase ?? "UNKNOWN";
    switch (phase) {
      case "PRE_NEWS":
        return {
          label: "⚠️ PRE-NEWS (≤30m) • AUTO WAIT",
          cls: "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse",
        };
      case "NEWS_RELEASE":
        return {
          label: "🚨 RILIS NEWS AKTIF • DILARANG ENTRY",
          cls: "bg-rose-600/30 text-rose-200 border-rose-400 animate-pulse",
        };
      case "POST_NEWS_SETTLING":
        return {
          label: "⏳ PASCA-NEWS (5-30m) • TUNGGU SPIKE REDA",
          cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
        };
      case "CLEAR":
        return {
          label: "✅ ZONA AMAN NEWS • LIMIT ORDER AKTIF",
          cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
        };
      default:
        return {
          label: "KALENDER STANDBY",
          cls: "bg-slate-800 text-slate-400 border-slate-700",
        };
    }
  })();

  const formatWibTime = (timeMs: number) => {
    return new Date(timeMs).toLocaleString("id-ID", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
  };

  const formatCountdownMinutes = (mins: number | null) => {
    if (mins === null) return "-";
    if (mins < 60) return `${mins} menit`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} jam ${m} mnt`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* =====================================================================
          PANEL KIRI (6 KOLOM): PENCARI MOMEN STRUKTUR PASAR & KANDIDAT LIMIT
         ===================================================================== */}
      <div className="lg:col-span-6 bg-[#111621] border border-[#1E2738] rounded-xl overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#1E2738] bg-[#0D121B] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Crosshair className="w-4 h-4 text-amber-400" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Mesin Pencari Momen (SMC Structure & Pending Limit)
            </h3>
          </div>

          <span
            className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded border ${
              isBullStructure
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : isBearStructure
                ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                : "bg-amber-500/15 text-amber-300 border-amber-500/40"
            }`}
          >
            STRUKTUR: {structure.trend}
          </span>
        </div>

        <div className="p-5 space-y-4 flex-1">
          {/* Baris 1: BOS/CHoCH Terakhir & Dealing Range (Discount / Premium) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* BOS / CHoCH Card */}
            <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-3.5 font-mono">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Break Struktur Terakhir
                </span>
                {structure.lastBreak && (
                  <span className="text-[10px] text-slate-500">
                    {structure.lastBreak.candlesAgo} candle lalu
                  </span>
                )}
              </div>

              {structure.lastBreak ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold border ${
                        structure.lastBreak.direction === "BULLISH"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/40"
                      }`}
                    >
                      {structure.lastBreak.type}{" "}
                      {structure.lastBreak.direction}
                    </span>
                    <span className="text-sm font-bold text-white">
                      @ ${structure.lastBreak.level.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    {structure.lastBreak.type === "CHOCH"
                      ? "Change of Character: Indikasi awal pembalikan arah struktur."
                      : "Break of Structure: Konfirmasi kelanjutan tren institusi."}
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-2">
                  Belum ada penembusan body candle pada swing utama terdekat.
                </div>
              )}
            </div>

            {/* Dealing Range (Discount vs Equilibrium vs Premium) */}
            <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-3.5 font-mono">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  Dealing Range & Posisi Harga
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    structure.pricePosition === "DISCOUNT"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : structure.pricePosition === "PREMIUM"
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {structure.pricePosition} ({structure.positionPct}%)
                </span>
              </div>

              {/* Gauge Bar */}
              <div className="relative h-2.5 w-full rounded-full overflow-hidden bg-gradient-to-r from-emerald-500/40 via-amber-400/40 to-rose-500/40 border border-slate-700/70 my-2">
                <div
                  className="absolute top-0 bottom-0 w-1.5 bg-white rounded shadow-[0_0_8px_#fff]"
                  style={{
                    left: `calc(${Math.min(
                      98,
                      Math.max(2, structure.positionPct)
                    )}% - 3px)`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>
                  Low:{" "}
                  <strong className="text-emerald-400">
                    ${structure.rangeLow.toFixed(2)}
                  </strong>
                </span>
                <span>
                  EQ (50%):{" "}
                  <strong className="text-amber-300">
                    ${structure.equilibrium.toFixed(2)}
                  </strong>
                </span>
                <span>
                  High:{" "}
                  <strong className="text-rose-400">
                    ${structure.rangeHigh.toFixed(2)}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Baris 2: Liquidity Sweeps (Stop-Hunt) & Fresh OB/FVG Zones */}
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-3.5 font-mono text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Radar className="w-3.5 h-3.5 text-purple-400" />
                Deteksi Liquidity Sweep (Stop-Hunt) & Zona Institusi Segar
              </span>
              <span className="text-[10px] text-slate-500">
                {structure.zones.length} Zona Unmitigated
              </span>
            </div>

            {structure.recentSweeps.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {structure.recentSweeps.map((sw, idx) => (
                  <div
                    key={idx}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1.5 ${
                      sw.side === "SELL_SIDE"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    }`}
                  >
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>
                      {sw.side === "SELL_SIDE"
                        ? `Bullish Sweep (Sell-Side Liquidity $${sw.level.toFixed(
                            2
                          )} disapu, ekor ${sw.wickPts} pts, ${
                            sw.candlesAgo
                          } candle lalu)`
                        : `Bearish Sweep (Buy-Side Liquidity $${sw.level.toFixed(
                            2
                          )} disapu, ekor ${sw.wickPts} pts, ${
                            sw.candlesAgo
                          } candle lalu)`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">
                Tidak ada sapuan likuiditas (stop-hunt wick) pada 8 candle terakhir.
              </div>
            )}

            {/* Pills OB & FVG */}
            {structure.zones.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {structure.zones.slice(0, 6).map((z, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded text-[10px] border ${
                      z.side === "BULLISH"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                        : "bg-rose-500/10 text-rose-300 border-rose-500/25"
                    }`}
                  >
                    {z.side === "BULLISH" ? "🟢 Bull" : "🔴 Bear"} {z.kind}: $
                    {z.low.toFixed(2)}–${z.high.toFixed(2)} ({z.candlesAgo}c)
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Baris 3: Daftar Kandidat Momen BUY LIMIT / SELL LIMIT */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between font-mono">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Kandidat Momen Pending Order ({structure.candidates.length} Setup)
              </span>
              <span className="text-[11px] text-slate-400">
                Harga Sekarang: <strong className="text-white">${currentPrice.toFixed(2)}</strong>
              </span>
            </div>

            {structure.candidates.length === 0 ? (
              <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-5 text-center font-mono text-xs text-slate-400">
                Belum ditemukan zona Buy Limit atau Sell Limit dengan rasio Risk:Reward
                memadai (minimal 1:1.3). AI merekomendasikan <strong>WAIT</strong>.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {structure.candidates.map((cand) => {
                  const isBuyLimit = cand.orderType === "BUY_LIMIT";
                  const isActiveSetup =
                    activeSignal &&
                    Math.abs(activeSignal.entryPrice - cand.entry) < 0.05;
                  const distPips = Math.round(cand.distanceFromPrice * 10);

                  return (
                    <div
                      key={cand.id}
                      className={`bg-[#0B0F17] rounded-xl p-3.5 border transition font-mono text-xs ${
                        isActiveSetup
                          ? "border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.12)]"
                          : "border-[#1E2738] hover:border-slate-700"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[11px] border flex items-center gap-1 ${
                              isBuyLimit
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                                : "bg-rose-500/15 text-rose-400 border-rose-500/40"
                            }`}
                          >
                            {isBuyLimit ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {cand.orderType.replace("_", " ")}
                          </span>

                          <span className="font-semibold text-slate-200">
                            {cand.setupType}
                          </span>

                          {isActiveSetup && (
                            <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold text-[10px]">
                              DIPILIH AI
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              cand.score >= 65
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                : cand.score >= 50
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            Skor {cand.score}/100
                          </span>

                          {onSelectCandidate && (
                            <button
                              type="button"
                              onClick={() => onSelectCandidate(cand)}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[10px] transition"
                            >
                              Muat ke Kartu
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Grid Angka Limit, SL, TP1, TP2 */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#111621] p-2.5 rounded-lg border border-slate-800/80 mb-2">
                        <div>
                          <div className="text-[10px] text-slate-400">
                            Harga Limit (Zona)
                          </div>
                          <div className="font-bold text-sky-300">
                            ${cand.entry.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            ${cand.entryLow.toFixed(2)}–${cand.entryHigh.toFixed(2)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-slate-400">
                            Stop Loss (SL)
                          </div>
                          <div className="font-bold text-rose-400">
                            ${cand.stopLoss.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Di luar zona + ATR
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-slate-400">
                            TP 1 / TP 2
                          </div>
                          <div className="font-bold text-emerald-400">
                            ${cand.tp1.toFixed(2)} / ${cand.tp2.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            RR 1:{cand.rr1} • 1:{cand.rr2}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-slate-400">
                            Jarak Jemputan
                          </div>
                          <div className="font-bold text-amber-300">
                            {isBuyLimit ? "-" : "+"}
                            {cand.distanceFromPrice.toFixed(2)} pts ({distPips} pips)
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Batal @ ${cand.cancelLevel.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Reasons */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        {cand.reasons.map((r, idx) => (
                          <span key={idx} className="flex items-center gap-1">
                            <span className="text-amber-400">•</span> {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          PANEL KANAN (6 KOLOM): ANALISIS NEWS USD, ARAH CANDLE & DETEKTOR SPIKE
         ===================================================================== */}
      <div className="lg:col-span-6 bg-[#111621] border border-[#1E2738] rounded-xl overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#1E2738] bg-[#0D121B] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-4 h-4 text-amber-400" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Analisis News USD, Skenario Candle & Detektor Spike
            </h3>
          </div>

          <span
            className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border ${phaseBadge.cls}`}
          >
            {phaseBadge.label}
          </span>
        </div>

        <div className="p-5 space-y-4 flex-1 font-mono">
          {/* Peringatan / Guidance Utama News */}
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
              news?.caution
                ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
                : "bg-[#0B0F17] border-[#1E2738] text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-amber-400 uppercase text-[11px]">
                {news?.caution ? (
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                Status & Panduan Eksekusi News
              </span>

              {news?.nextHigh && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  High News Berikutnya:{" "}
                  {formatCountdownMinutes(news.minutesToNextHigh)}
                </span>
              )}
            </div>

            {news?.caution && (
              <p className="text-xs font-bold text-rose-300">{news.caution}</p>
            )}
            <p className="text-xs text-slate-300 leading-relaxed">
              {news?.guidance ||
                "Kalender ekonomi sedang dimuat. Utamakan pending order (Buy Limit / Sell Limit) pada zona struktur."}
            </p>
          </div>

          {/* Detektor Spike & Anomali Candle Saat News */}
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                Detektor Spike & Stop-Hunt Pasca-News
              </span>
              {news?.spike ? (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    news.spike.spikeDetected
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  {news.spike.spikeDetected
                    ? `⚡ SPIKE TERDETEKSI (${news.spike.rangeAtr}x ATR)`
                    : "TIDAK ADA SPIKE EKSTREM"}
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">
                  Monitoring Aktif (Ambang ≥ 1.8x ATR)
                </span>
              )}
            </div>

            {news?.spike ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#111621] p-2.5 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-400">Rilis News</div>
                    <div className="font-bold text-white truncate">
                      {news.spike.eventTitle}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {news.spike.minutesSince} mnt lalu
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400">
                      Rentang Spike
                    </div>
                    <div className="font-bold text-amber-300">
                      {news.spike.rangePts} pts ({news.spike.rangeAtr}x ATR)
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Arah Awal: {news.spike.direction}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400">
                      Wick Rejection
                    </div>
                    <div className="font-bold text-sky-300">
                      {news.spike.wickRejection === "UPPER"
                        ? "Ekor Atas Panjang"
                        : news.spike.wickRejection === "LOWER"
                        ? "Ekor Bawah Panjang"
                        : "Body Dominan"}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Retrace: {news.spike.retracedPct}%
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400">
                      Status Pasar
                    </div>
                    <div
                      className={`font-bold ${
                        news.spike.settled ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {news.spike.settled ? "Sudah Tenang" : "Masih Liar"}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {news.spike.reliable ? "Siap Limit" : "Tunggu Reda"}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {news.spike.summary}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Tidak ada rilis news USD berdampak tinggi dalam 90 menit terakhir.
                Detektor spike otomatis menghitung ukuran lonjakan candle (dalam poin &
                kelipatan ATR), penolakan ekor (fakeout wick), dan persentase
                retracement segera setelah news rilis.
              </p>
            )}
          </div>

          {/* Skenario Pergerakan Candle Untuk Setiap News Mendatang */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Skenario Pergerakan Candle Saat News USD ({news?.scenarios.length ?? 0}{" "}
                Agenda)
              </span>
              <span className="text-[10px] text-slate-500">
                Sumber: {news?.source || "Forex Factory"}
              </span>
            </div>

            {!news || news.scenarios.length === 0 ? (
              <div className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-4 text-center text-xs text-slate-500">
                Tidak ada jadwal news USD High/Medium terdekat dalam jendela pantauan.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {news.scenarios.map((sc, idx) => {
                  const isHigh = sc.impact === "High";
                  const diffMin = Math.round((sc.timeMs - Date.now()) / 60000);
                  const timeStatus =
                    diffMin > 0
                      ? `Dalam ${formatCountdownMinutes(diffMin)}`
                      : `Baru rilis ${Math.abs(diffMin)} mnt lalu`;

                  return (
                    <div
                      key={idx}
                      className="bg-[#0B0F17] border border-[#1E2738] rounded-xl p-3.5 text-xs space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isHigh
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            }`}
                          >
                            {isHigh ? "🔥 HIGH IMPACT" : "⚡ MEDIUM"}
                          </span>
                          <span className="font-bold text-white">
                            USD • {sc.eventTitle}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400">
                          {formatWibTime(sc.timeMs)} WIB ({timeStatus})
                        </div>
                      </div>

                      {/* Forecast vs Previous */}
                      <div className="flex items-center gap-4 text-[11px] text-slate-400 bg-[#111621] px-3 py-1.5 rounded-lg border border-slate-800/80">
                        <span>
                          Forecast:{" "}
                          <strong className="text-sky-300">
                            {sc.forecast || "-"}
                          </strong>
                        </span>
                        <span>
                          Previous:{" "}
                          <strong className="text-slate-200">
                            {sc.previous || "-"}
                          </strong>
                        </span>
                      </div>

                      {/* 2 Kolom Skenario Arah Candle */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Jika Aktual > Forecast */}
                        <div className="p-2.5 rounded-lg bg-[#111621] border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-semibold">
                              Jika Aktual &gt; Forecast:
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 ${
                                sc.ifAbove.goldBias === "BULLISH"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : sc.ifAbove.goldBias === "BEARISH"
                                  ? "bg-rose-500/15 text-rose-400"
                                  : "bg-amber-500/15 text-amber-300"
                              }`}
                            >
                              {sc.ifAbove.goldBias === "BULLISH" ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : sc.ifAbove.goldBias === "BEARISH" ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : null}
                              GOLD {sc.ifAbove.goldBias}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {sc.ifAbove.text}
                          </p>
                        </div>

                        {/* Jika Aktual < Forecast */}
                        <div className="p-2.5 rounded-lg bg-[#111621] border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-semibold">
                              Jika Aktual &lt; Forecast:
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 ${
                                sc.ifBelow.goldBias === "BULLISH"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : sc.ifBelow.goldBias === "BEARISH"
                                  ? "bg-rose-500/15 text-rose-400"
                                  : "bg-amber-500/15 text-amber-300"
                              }`}
                            >
                              {sc.ifBelow.goldBias === "BULLISH" ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : sc.ifBelow.goldBias === "BEARISH" ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : null}
                              GOLD {sc.ifBelow.goldBias}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {sc.ifBelow.text}
                          </p>
                        </div>
                      </div>

                      {/* Rencana Limit Order Saat News */}
                      <div className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <strong className="text-amber-400">
                          Taktik Limit Order:{" "}
                        </strong>
                        {sc.plan}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

