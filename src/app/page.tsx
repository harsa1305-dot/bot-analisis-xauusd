"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import GoldChart from "@/components/GoldChart";
import SignalCard from "@/components/SignalCard";
import IndicatorPanel from "@/components/IndicatorPanel";
import StructureAndNewsPanel from "@/components/StructureAndNewsPanel";
import SignalHistoryTable from "@/components/SignalHistoryTable";
import ApiKeyModal from "@/components/ApiKeyModal";
import MarketSessionBar from "@/components/MarketSessionBar";
import TopAnalystBar from "@/components/TopAnalystBar";
import { evaluateTradeLifecycle } from "@/lib/tradeLifecycle";
import {
  AISignalResult,
  AnalystAlert,
  AnalyzeGoldResponse,
  Candle,
  LimitCandidate,
  LinePoint,
  NewsContext,
  PreProcessedMarketData,
  Timeframe,
} from "@/lib/types";
import {
  Activity,
  Clock,
  Power,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

const TIMEFRAMES: Timeframe[] = ["M5", "M15", "H1", "H4"];

export default function GoldTradingDashboard() {
  const [timeframe, setTimeframe] = useState<Timeframe>("M15");
  const [marketData, setMarketData] = useState<PreProcessedMarketData | null>(
    null
  );
  const [candles, setCandles] = useState<Candle[]>([]);
  const [ema50Series, setEma50Series] = useState<LinePoint[]>([]);
  const [ema200Series, setEma200Series] = useState<LinePoint[]>([]);
  const [activeSignal, setActiveSignal] = useState<AISignalResult | null>(null);
  const [history, setHistory] = useState<AISignalResult[]>([]);
  const [newsContext, setNewsContext] = useState<NewsContext | null>(null);
  const [alerts, setAlerts] = useState<AnalystAlert[]>([]);

  // State Live Tick 0.5 Detik (500ms Zero-Delay Stream)
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<"UP" | "DOWN" | "IDLE">(
    "IDLE"
  );
  const prevPriceRef = useRef<number | null>(null);
  const isPollingTickRef = useRef<boolean>(false);

  // Konfigurasi Auto-Monitor 24 Jam & API Key
  const [autoMonitor, setAutoMonitor] = useState<boolean>(true);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(5);
  const [openaiModel, setOpenaiModel] = useState<string>("gpt-4o-mini");
  const [hasOpenaiKey, setHasOpenaiKey] = useState<boolean>(true);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [hasTwelveDataKey, setHasTwelveDataKey] = useState<boolean>(false);
  const [useOllama, setUseOllama] = useState<boolean>(true);
  const [ollamaModel, setOllamaModel] = useState<string>("qwen2.5:3b");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>("http://127.0.0.1:11434");
  const [aiProvider, setAiProvider] = useState<string>("auto");

  const [loading, setLoading] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Fungsi memanggil API Backend (/api/analyze-gold)
  const runAnalysis = useCallback(
    async (
      targetTf: Timeframe,
      mode: "initial" | "manual" | "auto" = "manual"
    ) => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setAnalyzing(true);
      }
      setErrorMsg(null);

      try {
        const res =
          mode === "initial"
            ? await fetch(
                `/api/analyze-gold?timeframe=${targetTf}&mode=initial`,
                { cache: "no-store" }
              )
            : await fetch("/api/analyze-gold", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  timeframe: targetTf,
                  triggerType: mode === "auto" ? "AUTO_24H" : "MANUAL",
                }),
              });

        const data: AnalyzeGoldResponse = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Gagal mengambil data analisa XAU/USD");
        }

        setMarketData(data.marketData);
        setCandles(data.candles);
        setEma50Series(data.ema50Series);
        setEma200Series(data.ema200Series);

        const incomingSignal: AISignalResult = {
          ...data.signal,
          tradeStatus:
            data.signal.tradeStatus ||
            (data.signal.signal === "WAIT" ? "STANDBY_WAIT" : "WAITING_FILL"),
        };

        setActiveSignal(incomingSignal);
        setHistory(data.history);
        setNewsContext(data.news ?? null);
        setLivePrice(data.marketData.currentPrice);
        prevPriceRef.current = data.marketData.currentPrice;

        if (incomingSignal.signal !== "WAIT") {
          const newAlert: AnalystAlert = {
            id: `alert-new-${Date.now()}`,
            type: "SIGNAL_NEW",
            title: `🔔 Setup Baru: ${incomingSignal.orderType || incomingSignal.signal}`,
            message: `Limit @ $${incomingSignal.entryPrice.toFixed(
              2
            )} (TP1: $${incomingSignal.tp1.toFixed(2)} • SL: $${incomingSignal.stopLoss.toFixed(
              2
            )})`,
            timestamp: Date.now(),
          };
          setAlerts((prev) => [newAlert, ...prev].slice(0, 30));
        }

        if (data.config) {
          setAutoMonitor(data.config.autoMonitorEnabled);
          setIntervalMinutes(data.config.intervalMinutes || 5);
          setOpenaiModel(data.config.openaiModel || "gpt-4o-mini");
          setHasOpenaiKey(data.config.hasOpenaiKey);
          setHasGeminiKey(data.config.hasGeminiKey);
          setHasTwelveDataKey(data.config.hasTwelveDataKey);
          if (typeof data.config.useOllama === "boolean") setUseOllama(data.config.useOllama);
          if (data.config.ollamaModel) setOllamaModel(data.config.ollamaModel);
          if (data.config.ollamaBaseUrl) setOllamaBaseUrl(data.config.ollamaBaseUrl);
        }
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat menghubungi server"
        );
      } finally {
        setLoading(false);
        setAnalyzing(false);
      }
    },
    []
  );

  // Panggil analisa saat halaman pertama kali dibuka
  useEffect(() => {
    runAnalysis(timeframe, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mesin Zero-Delay Live Tick 0.5 Detik (500ms) dari RAM Cache Server
  useEffect(() => {
    let flashTimeout: NodeJS.Timeout | undefined;

    const pollLiveTick = async () => {
      if (isPollingTickRef.current) return;
      isPollingTickRef.current = true;

      try {
        const res = await fetch("/api/live-tick", { cache: "no-store" });
        if (!res.ok) return;
        const tick = await res.json();
        if (!tick?.success || typeof tick.price !== "number") return;

        const newPrice = tick.price;
        const prev = prevPriceRef.current;

        if (prev !== null && newPrice !== prev) {
          setPriceDirection(newPrice > prev ? "UP" : "DOWN");
          if (flashTimeout) clearTimeout(flashTimeout);
          flashTimeout = setTimeout(() => setPriceDirection("IDLE"), 450);
        }

        prevPriceRef.current = newPrice;
        setLivePrice(newPrice);

        setMarketData((curr) => {
          if (!curr) return curr;
          return {
            ...curr,
            currentPrice: newPrice,
            high24h: tick.high24h
              ? Math.max(curr.high24h, tick.high24h, newPrice)
              : Math.max(curr.high24h, newPrice),
            low24h: tick.low24h
              ? Math.min(curr.low24h, tick.low24h, newPrice)
              : Math.min(curr.low24h, newPrice),
            priceChange24h:
              typeof tick.change24h === "number"
                ? tick.change24h
                : curr.priceChange24h,
            priceChangePercent24h:
              typeof tick.changePercent24h === "number"
                ? tick.changePercent24h
                : curr.priceChangePercent24h,
          };
        });
      } catch {
        // Abaikan jeda jaringan sesaat
      } finally {
        isPollingTickRef.current = false;
      }
    };

    const tickInterval = setInterval(pollLiveTick, 500);
    return () => {
      clearInterval(tickInterval);
      if (flashTimeout) clearTimeout(flashTimeout);
    };
  }, []);

  // Evaluasi Siklus Hidup Posisi Real-Time: Mengunci setup hingga selesai (TP atau SL)!
  useEffect(() => {
    if (!activeSignal || !livePrice || livePrice <= 0) return;

    const { updatedSignal, statusChanged, alert, isTradeResolved } =
      evaluateTradeLifecycle(activeSignal, livePrice);

    if (statusChanged) {
      setActiveSignal(updatedSignal);

      if (alert) {
        setAlerts((prev) => [alert, ...prev].slice(0, 30));
      }

      // Jika trade baru saja selesai (Hit TP2, Hit SL, atau Batal):
      // Berikan jeda 1.5 detik agar trader melihat status, lalu langsung panggil analisa segar!
      if (isTradeResolved) {
        const timeout = setTimeout(() => {
          runAnalysis(timeframe, "manual");
        }, 1500);
        return () => clearTimeout(timeout);
      }
    }
  }, [livePrice, activeSignal, timeframe, runAnalysis]);

  // Sinkronisasi ringan riwayat sinyal dari background worker setiap 45 detik
  useEffect(() => {
    const syncTimer = setInterval(async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        const data = await res.json();
        if (data?.success && Array.isArray(data.history)) {
          setHistory(data.history);
        }
      } catch {
        // Abaikan error jaringan sementara
      }
    }, 45000);

    return () => clearInterval(syncTimer);
  }, []);

  // Ganti Timeframe (M5, M15, H1, H4)
  const handleSelectTimeframe = (newTf: Timeframe) => {
    if (newTf === timeframe && !loading) return;
    setTimeframe(newTf);
    runAnalysis(newTf, "manual");
  };

  // Toggle Saklar Auto-Monitor 24 Jam (ON / OFF)
  const handleToggleAutoMonitor = async () => {
    const nextState = !autoMonitor;
    setAutoMonitor(nextState);

    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoMonitorEnabled: nextState }),
      });
    } catch {
      // Ignore
    }
  };

  // Simpan API Key & Konfigurasi dari Modal Settings
  const handleSaveConfig = async (payload: {
    openaiApiKey?: string;
    openaiModel?: string;
    geminiApiKey?: string;
    twelveDataApiKey?: string;
    intervalMinutes: number;
    useOllama?: boolean;
    ollamaModel?: string;
    ollamaBaseUrl?: string;
    aiProvider?: "auto" | "ollama" | "openai" | "gemini";
  }) => {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.success && data.config) {
      setIntervalMinutes(data.config.intervalMinutes);
      setOpenaiModel(data.config.openaiModel || "gpt-4o-mini");
      setHasOpenaiKey(data.config.hasOpenaiKey);
      setHasGeminiKey(data.config.hasGeminiKey);
      setHasTwelveDataKey(data.config.hasTwelveDataKey);
      if (typeof data.config.useOllama === "boolean") setUseOllama(data.config.useOllama);
      if (data.config.ollamaModel) setOllamaModel(data.config.ollamaModel);
      if (data.config.ollamaBaseUrl) setOllamaBaseUrl(data.config.ollamaBaseUrl);
      if (data.config.aiProvider) setAiProvider(data.config.aiProvider);
      await runAnalysis(timeframe, "manual");
    }
  };

  // Bersihkan riwayat sinyal
  const handleClearHistory = async () => {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_history" }),
    });
    setHistory([]);
  };

  const displaySpotPrice = livePrice ?? marketData?.currentPrice ?? 0;
  const isPriceUp = (marketData?.priceChange24h ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-[#090C10] text-slate-100 flex flex-col">
      {/* TOP NAVIGATION & CONTROL TERMINAL BAR */}
      <header className="sticky top-0 z-30 bg-[#0D121B]/95 backdrop-blur-md border-b border-[#1E2738] px-4 lg:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Live Price Box */}
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Zap className="w-5 h-5 text-slate-950 fill-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-mono font-extrabold text-base tracking-tight text-white">
                    XAU/USD AI TERMINAL
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Radio className="w-3 h-3 animate-pulse" />
                    0.5s ULTRA-LIVE
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400">
                  500ms Zero-Delay Global Spot +{" "}
                  {activeSignal?.aiEngine === "OLLAMA_LOCAL" || (useOllama && aiProvider === "ollama")
                    ? `🦙 Ollama Local (${ollamaModel})`
                    : activeSignal?.aiEngine === "OPENAI_GPT"
                    ? `OpenAI GPT (${openaiModel})`
                    : activeSignal?.aiEngine === "GEMINI_2_5_FLASH"
                    ? "Gemini 2.5 Flash"
                    : `SMC Quant Math + 🦙 Ollama Ready`}
                </p>
              </div>
            </div>

            {/* Kotak Harga Real-Time yang Bergerak Hidup (0.5s Tick) */}
            {marketData && (
              <div
                className={`flex items-center gap-4 px-4 py-2 rounded-xl border transition-colors duration-200 ${
                  priceDirection === "UP"
                    ? "bg-emerald-500/15 border-emerald-500/60"
                    : priceDirection === "DOWN"
                    ? "bg-rose-500/15 border-rose-500/60"
                    : "bg-[#090D14] border-[#1E2738]"
                }`}
              >
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1.5">
                    <span>Spot Gold (OANDA:XAUUSD)</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-2xl font-mono font-extrabold transition-colors duration-200 ${
                        priceDirection === "UP"
                          ? "text-emerald-300"
                          : priceDirection === "DOWN"
                          ? "text-rose-300"
                          : "text-amber-400"
                      }`}
                    >
                      ${displaySpotPrice.toFixed(2)}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold flex items-center gap-0.5 ${
                        isPriceUp ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isPriceUp ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      {isPriceUp ? "+" : ""}
                      {marketData.priceChange24h.toFixed(2)} (
                      {isPriceUp ? "+" : ""}
                      {marketData.priceChangePercent24h.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="hidden sm:flex flex-col border-l border-slate-800 pl-3 text-[11px] font-mono text-slate-400">
                  <span>
                    High:{" "}
                    <strong className="text-emerald-400">
                      ${marketData.high24h.toFixed(2)}
                    </strong>
                  </span>
                  <span>
                    Low:{" "}
                    <strong className="text-rose-400">
                      ${marketData.low24h.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Kontrol Timeframe, Saklar Auto-Monitor, & Tombol Analisa Ulang */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Pilihan Timeframe (M5, M15, H1, H4) */}
            <div className="flex items-center bg-[#090D14] p-1 rounded-xl border border-[#1E2738]">
              {TIMEFRAMES.map((tf) => {
                const active = tf === timeframe;
                return (
                  <button
                    key={tf}
                    type="button"
                    disabled={analyzing || loading}
                    onClick={() => handleSelectTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition ${
                      active
                        ? "bg-amber-500 text-slate-950 shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>

            {/* Saklar Pengawasan Posisi 24 Jam (Trade-Driven: TP / SL Watcher) */}
            <button
              type="button"
              onClick={handleToggleAutoMonitor}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border font-mono text-xs transition ${
                autoMonitor
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-800/60 border-slate-700 text-slate-400"
              }`}
            >
              <Power
                className={`w-4 h-4 ${
                  autoMonitor ? "text-emerald-400" : "text-slate-500"
                }`}
              />
              <div className="text-left">
                <div className="text-[10px] uppercase opacity-80 leading-none">
                  Pengawasan 24H
                </div>
                <div className="font-bold flex items-center gap-1.5 mt-0.5">
                  <span>{autoMonitor ? "AKTIF" : "OFF"}</span>
                  {autoMonitor && (
                    <span className="text-[10px] text-emerald-400/90 flex items-center gap-1">
                      •{" "}
                      {activeSignal?.tradeStatus === "WAITING_FILL"
                        ? "Jemputan Limit"
                        : activeSignal?.tradeStatus === "FILLED_IN_POSITION"
                        ? "Kawal TP/SL"
                        : "Event-Driven (TP/SL)"}
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Tombol Analisa Ulang Manual */}
            <button
              type="button"
              disabled={analyzing || loading}
              onClick={() => runAnalysis(timeframe, "manual")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-extrabold tracking-wide shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${analyzing || loading ? "animate-spin" : ""}`}
              />
              <span>{analyzing ? "MENGANALISA..." : "ANALISA ULANG"}</span>
            </button>

            {/* Tombol Pengaturan API Key */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              title="Pengaturan API Key & Interval Auto-Monitor"
              className="p-2.5 rounded-xl bg-[#090D14] hover:bg-slate-800 text-slate-300 border border-[#1E2738] transition relative"
            >
              <Settings className="w-4 h-4" />
              {!hasOpenaiKey && !hasGeminiKey && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-4 space-y-4">
        {/* FITUR CHAT & NOTIFIKASI AI ANALYST + STATUS TRADE LIFECYCLE (TERLETAK DI ATAS) */}
        <TopAnalystBar
          signal={activeSignal}
          livePrice={displaySpotPrice}
          timeframe={timeframe}
          news={newsContext}
          alerts={alerts}
          onTriggerNewAnalysis={() => runAnalysis(timeframe, "manual")}
          isAnalyzing={analyzing || loading}
        />

        {/* BAR SESI PASAR EMAS GLOBAL (Sydney, Asia/Tokyo, Eropa/London, Amerika/New York + Overlap) */}
        <MarketSessionBar />

        {/* Banner Info Status AI / Error */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 font-mono text-xs flex items-center justify-between">
            <span>⚠️ {errorMsg}</span>
            <button
              type="button"
              onClick={() => runAnalysis(timeframe, "manual")}
              className="px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-white"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!hasOpenaiKey && !hasGeminiKey && !loading && (
          <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Saat ini berjalan dengan{" "}
                <strong>Quantitative Mathematical Engine</strong>. Masukkan{" "}
                <code>OPENAI_API_KEY</code> atau <code>GEMINI_API_KEY</code>{" "}
                untuk mengaktifkan penalaran penuh LLM.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition"
            >
              Pasang API Key
            </button>
          </div>
        )}

        {/* GRID UTAMA: CHART CANDLESTICK (KIRI) & KARTU SINYAL AI (KANAN) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-7 xl:col-span-8">
            <GoldChart
              candles={candles}
              ema50Series={ema50Series}
              ema200Series={ema200Series}
              signal={activeSignal}
              keyLevels={marketData?.keyLevels ?? null}
              timeframe={timeframe}
              dataSource={marketData?.dataSource ?? "Loading Market Feed..."}
              livePrice={livePrice}
              priceDirection={priceDirection}
            />
          </div>

          <div className="lg:col-span-5 xl:col-span-4">
            <SignalCard
              signal={activeSignal}
              loading={analyzing || loading}
              livePrice={livePrice}
            />
          </div>
        </div>

        {/* PANEL PENCARI MOMEN LIMIT ORDER (SMC STRUCTURE) & ANALISIS NEWS USD / DETEKTOR SPIKE */}
        <StructureAndNewsPanel
          structure={marketData?.structure}
          news={newsContext}
          currentPrice={displaySpotPrice}
          activeSignal={activeSignal}
          onSelectCandidate={(cand: LimitCandidate) => {
            if (!activeSignal) return;
            const isBuyLim = cand.orderType === "BUY_LIMIT";
            const updated: AISignalResult = {
              ...activeSignal,
              signal: isBuyLim ? "BUY" : "SELL",
              orderType: cand.orderType,
              tradeStatus: "WAITING_FILL",
              setupType: cand.setupType,
              confidence: Math.min(92, Math.max(55, cand.score)),
              confluenceScore: cand.score,
              entryPrice: cand.entry,
              entryZoneLow: cand.entryLow,
              entryZoneHigh: cand.entryHigh,
              stopLoss: cand.stopLoss,
              tp1: cand.tp1,
              tp2: cand.tp2,
              slPips: Math.round(Math.abs(cand.entry - cand.stopLoss) * 10),
              tp1Pips: Math.round(Math.abs(cand.tp1 - cand.entry) * 10),
              tp2Pips: Math.round(Math.abs(cand.tp2 - cand.entry) * 10),
              riskRewardRatio: `1:${cand.rr1} (TP1) / 1:${cand.rr2} (TP2)`,
              cancelLevel: cand.cancelLevel,
              expiresInCandles: cand.expiresInCandles,
              keyFactors: cand.reasons,
            };
            setActiveSignal(updated);
            setAlerts((prev) => [
              {
                id: `alert-cand-${Date.now()}`,
                type: "SIGNAL_NEW",
                title: `Setup Dipilih: ${updated.orderType}`,
                message: `Limit @ $${updated.entryPrice.toFixed(
                  2
                )} (TP1: $${updated.tp1.toFixed(2)} • SL: $${updated.stopLoss.toFixed(
                  2
                )})`,
                timestamp: Date.now(),
              },
              ...prev,
            ]);
          }}
        />

        {/* PANEL INDIKATOR MATEMATIKA PRA-PENGOLAHAN (TAHAP 3) + INSPEKTOR JSON TWELVE DATA */}
        <IndicatorPanel marketData={marketData} candles={candles} />

        {/* TABEL RIWAYAT SINYAL PEMANTAUAN 24 JAM */}
        <SignalHistoryTable
          history={history}
          selectedSignalId={activeSignal?.id}
          onSelectSignal={(sig) => setActiveSignal(sig)}
          onClearHistory={handleClearHistory}
        />
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[#1E2738] bg-[#0B0F17] px-6 py-3 mt-6">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              0.5s Zero-Delay Tick • Signal-Only Mode (Manual Execution) • Anti
              Stop-Hunt 1.5x ATR Protection
            </span>
          </div>
          <div>
            Indikator: EMA 50 • EMA 200 • RSI (14) • ATR (14) • Fractal Swing
            High/Low
          </div>
        </div>
      </footer>

      {/* MODAL PENGATURAN API KEY & INTERVAL */}
      <ApiKeyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        hasOpenaiKey={hasOpenaiKey}
        openaiModel={openaiModel}
        hasGeminiKey={hasGeminiKey}
        hasTwelveDataKey={hasTwelveDataKey}
        intervalMinutes={intervalMinutes}
        initialUseOllama={useOllama}
        initialOllamaModel={ollamaModel}
        initialOllamaBaseUrl={ollamaBaseUrl}
        initialAiProvider={aiProvider}
        onSaveConfig={handleSaveConfig}
      />
    </div>
  );
}
