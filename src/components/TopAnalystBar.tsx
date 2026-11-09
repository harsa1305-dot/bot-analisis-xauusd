"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AISignalResult,
  AnalystAlert,
  ChatMessage,
  NewsContext,
  Timeframe,
  TradeStatus,
} from "@/lib/types";
import {
  AlertCircle,
  Bell,
  BellOff,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  CornerDownLeft,
  Crosshair,
  Flame,
  HelpCircle,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

interface TopAnalystBarProps {
  signal: AISignalResult | null;
  livePrice: number | null;
  timeframe: Timeframe;
  news: NewsContext | null;
  alerts: AnalystAlert[];
  onTriggerNewAnalysis: () => void;
  isAnalyzing: boolean;
}

// Web Audio API sintetis untuk notifikasi suara tanpa memerlukan file mp3 eksternal
function playAudioNotification(type: AnalystAlert["type"]) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === "TP1_HIT" || type === "TP2_HIT") {
      // Pleasant high-pitch double chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.35); // D6

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start(ctx.currentTime + 0.15);
      osc1.stop(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.45);
    } else if (type === "ORDER_FILLED" || type === "SIGNAL_NEW") {
      // Clear attention ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.18); // G5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === "SL_HIT" || type === "ORDER_CANCELLED") {
      // Gentle low alert tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(329.63, ctx.currentTime); // E4
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3); // A3

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // Ignore audio permission errors
  }
}

export default function TopAnalystBar({
  signal,
  livePrice,
  timeframe,
  news,
  alerts,
  onTriggerNewAnalysis,
  isAnalyzing,
}: TopAnalystBarProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-welcome",
      sender: "analyst",
      text: "Halo! Saya AI Analyst XAU/USD Anda. Sistem ini mengunci setiap setup limit order hingga selesai (kena Target TP atau Stop Loss) sebelum mencari peluang baru. Klik tombol validasi di bawah atau tanyakan apa saja tentang pergerakan harga emas saat ini!",
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const lastAlertIdRef = useRef<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat saat ada pesan baru
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatOpen]);

  // Audio alert saat ada alert baru
  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    if (latest && latest.id !== lastAlertIdRef.current) {
      lastAlertIdRef.current = latest.id;
      if (soundEnabled) {
        playAudioNotification(latest.type);
      }
    }
  }, [alerts, soundEnabled]);

  const spotNow = livePrice && livePrice > 0 ? livePrice : signal?.currentPrice ?? 0;
  const status: TradeStatus = signal?.tradeStatus || (signal?.signal === "WAIT" ? "STANDBY_WAIT" : "WAITING_FILL");
  const isBuy = signal?.signal === "BUY" || signal?.orderType === "BUY_LIMIT";
  const isSell = signal?.signal === "SELL" || signal?.orderType === "SELL_LIMIT";

  // Hitung metrik floating real-time
  const floatingPips = signal
    ? isBuy
      ? Math.round((spotNow - signal.entryPrice) * 10)
      : isSell
      ? Math.round((signal.entryPrice - spotNow) * 10)
      : 0
    : 0;

  // Banner status & visual badge
  const statusConfig = (() => {
    switch (status) {
      case "WAITING_FILL": {
        const distPts = signal
          ? isBuy
            ? Math.max(0, spotNow - signal.entryPrice)
            : Math.max(0, signal.entryPrice - spotNow)
          : 0;
        const distPips = Math.round(distPts * 10);
        return {
          badge: `⏳ MENUNGGU JEMPUTAN ${signal?.orderType || "LIMIT"} [${signal?.timeframe || timeframe}]`,
          desc: `Jarak: ${distPts.toFixed(2)} pts (${distPips} pips) ke Limit $${signal?.entryPrice.toFixed(2)}`,
          cls: "bg-sky-500/15 border-sky-500/40 text-sky-300",
          dotCls: "bg-sky-400 animate-ping",
          canReanalyze: false,
          instruction: "Sinyal dikunci. Menunggu harga pullback/rally menjemput order.",
        };
      }
      case "FILLED_IN_POSITION": {
        const isProfit = floatingPips >= 0;
        return {
          badge: `🟢 POSISI AKTIF (${signal?.orderType || (isBuy ? "BUY" : "SELL")}) [${signal?.timeframe || timeframe}]`,
          desc: `Floating: ${isProfit ? "+" : ""}${floatingPips} Pips | Target TP1 $${signal?.tp1.toFixed(2)} • SL $${signal?.stopLoss.toFixed(2)}`,
          cls: isProfit
            ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
            : "bg-amber-500/15 border-amber-500/50 text-amber-300",
          dotCls: "bg-emerald-400 animate-pulse",
          canReanalyze: false,
          instruction: "Posisi sedang berjalan. Sistem mengawal hingga menyentuh TP atau SL.",
        };
      }
      case "CLOSED_TP1":
      case "CLOSED_TP2":
        return {
          badge: `🏆 TRADE SELESAI (TAKE PROFIT ${status === "CLOSED_TP2" ? "2 FULL" : "1"} HIT!)`,
          desc: `Hasil: +${signal?.realizedPips ?? signal?.tp2Pips ?? 0} Pips! Target tercapai dengan presisi.`,
          cls: "bg-emerald-500/25 border-emerald-400 text-emerald-200",
          dotCls: "bg-emerald-300",
          canReanalyze: true,
          instruction: "Trade selesai dengan profit. AI siap menganalisis momen setup berikutnya.",
        };
      case "CLOSED_SL":
        return {
          badge: "🛡️ TRADE SELESAI (STOP LOSS HIT)",
          desc: `Hasil: ${signal?.realizedPips ?? (signal?.slPips ? -signal.slPips : 0)} Pips. Kerugian dibatasi sesuai buffer ATR.`,
          cls: "bg-rose-500/20 border-rose-400 text-rose-200",
          dotCls: "bg-rose-400",
          canReanalyze: true,
          instruction: "Posisi ditutup teratur. AI mengevaluasi kondisi pasar dan mencari setup baru.",
        };
      case "CANCELLED_INVALIDATED":
        return {
          badge: "🚫 LIMIT ORDER BATAL (TARGET SUDAH LARI)",
          desc: `Harga menyentuh Cancel Level $${signal?.cancelLevel?.toFixed(2)} sebelum order terjemput.`,
          cls: "bg-slate-800 border-slate-700 text-slate-300",
          dotCls: "bg-slate-400",
          canReanalyze: true,
          instruction: "Setup kadaluarsa. AI siap menganalisis struktur baru yang lebih segar.",
        };
      default:
        return {
          badge: "⏸️ STANDBY (MENCARI MOMEN STRUKTUR)",
          desc: "Menunggu pembentukan Order Block / FVG dengan konfluensi tinggi.",
          cls: "bg-amber-500/10 border-amber-500/30 text-amber-300",
          dotCls: "bg-amber-400",
          canReanalyze: true,
          instruction: "Tidak ada posisi yang sedang berjalan. Analisis berkala aktif.",
        };
    }
  })();

  const handleSendMessage = async (textToSend?: string, quickAction?: string) => {
    const message = (textToSend ?? inputText).trim();
    if (!message && !quickAction) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: message || (quickAction ? `[Aksi Cepat: ${quickAction}]` : ""),
      timestamp: Date.now(),
      quickAction,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsSending(true);

    try {
      const res = await fetch("/api/chat-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          quickAction,
          timeframe,
        }),
      });

      const data = await res.json();
      if (data?.success && data.reply) {
        const analystMsg: ChatMessage = {
          id: `analyst-${Date.now()}`,
          sender: "analyst",
          text: data.reply,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, analystMsg]);
      } else {
        throw new Error(data?.error || "Gagal memuat balasan analis.");
      }
    } catch (err: unknown) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "analyst",
        text: `Maaf, terjadi gangguan saat menghubungi AI: ${
          err instanceof Error ? err.message : "Coba lagi beberapa saat lagi."
        }`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const latestAlert = alerts[0] || null;

  return (
    <div className="space-y-2">
      {/* =====================================================================
          TOP BAR UTAMA: STATUS TRADE LIFECYCLE & KONTROL CEPAT CHAT/NOTIF
         ===================================================================== */}
      <div className="bg-[#111621] border border-[#1E2738] rounded-2xl p-3 sm:p-4 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sisi Kiri: Status Trade Lifecycle Yang Terkunci */}
          <div className="flex items-center gap-3.5 flex-1 min-w-[280px]">
            <div
              className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${statusConfig.cls}`}
            >
              <Bot className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-lg border flex items-center gap-1.5 ${statusConfig.cls}`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusConfig.dotCls}`} />
                  {statusConfig.badge}
                </span>

                <span className="text-[11px] font-mono text-slate-400">
                  {statusConfig.desc}
                </span>
              </div>

              <p className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>{statusConfig.instruction}</span>
              </p>
            </div>
          </div>

          {/* Sisi Kanan: Tombol Audio, Notif Popover, Chat AI, & Reset Analisa */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle Suara Alert */}
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              title={soundEnabled ? "Suara Notifikasi: AKTIF" : "Suara Notifikasi: MATI"}
              className={`p-2 rounded-xl border font-mono text-xs transition ${
                soundEnabled
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-800 text-slate-500 border-slate-700"
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            {/* Tombol Notifikasi */}
            <button
              type="button"
              onClick={() => setIsAlertsOpen((v) => !v)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs transition ${
                isAlertsOpen
                  ? "bg-amber-500 text-slate-950 font-bold border-amber-400"
                  : "bg-[#090D14] hover:bg-slate-800 text-slate-300 border-[#1E2738]"
              }`}
            >
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Notif</span>
              {alerts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-extrabold text-[10px]">
                  {alerts.length}
                </span>
              )}
            </button>

            {/* Tombol Chat AI Analyst */}
            <button
              type="button"
              onClick={() => setIsChatOpen((v) => !v)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border font-mono text-xs font-bold transition shadow-lg ${
                isChatOpen
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-400 shadow-amber-500/20"
                  : "bg-[#090D14] hover:bg-slate-800 text-amber-300 border-amber-500/30"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat AI Analyst</span>
              {isChatOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Tombol Analisa Ulang / Selesaikan Trade */}
            {statusConfig.canReanalyze ? (
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={onTriggerNewAnalysis}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-extrabold transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`}
                />
                <span>{isAnalyzing ? "Menganalisis..." : "Cari Momen Baru"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onTriggerNewAnalysis}
                title="Posisi saat ini sedang dikunci. Klik jika ingin me-reset paksa."
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 font-mono text-xs transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset Paksa</span>
              </button>
            )}
          </div>
        </div>

        {/* Ticker Notifikasi Terakhir (Bila Ada) */}
        {latestAlert && (
          <div className="mt-2.5 pt-2.5 border-t border-[#1E2738]/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-300 truncate">
              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                TERBARU
              </span>
              <span className="font-semibold text-white">{latestAlert.title}:</span>
              <span className="text-slate-400 truncate">{latestAlert.message}</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0 ml-2">
              {new Date(latestAlert.timestamp).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              WIB
            </span>
          </div>
        )}
      </div>

      {/* =====================================================================
          DRAWER LOG NOTIFIKASI (Bila Dibuka)
         ===================================================================== */}
      {isAlertsOpen && (
        <div className="bg-[#0D121B] border border-[#1E2738] rounded-2xl p-4 shadow-2xl font-mono text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-amber-400 uppercase flex items-center gap-2">
              <Bell className="w-4 h-4" /> Riwayat Notifikasi AI ({alerts.length} Event)
            </span>
            <button
              type="button"
              onClick={() => setIsAlertsOpen(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              Tutup ✕
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center text-slate-500 py-4">
              Belum ada notifikasi trade. Notifikasi akan berbunyi dan tercatat saat
              sinyal terisi, mencapai TP, atau menyentuh SL.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {alerts.map((al) => (
                <div
                  key={al.id}
                  className="bg-[#111621] p-3 rounded-xl border border-slate-800/80 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      {al.type === "TP1_HIT" || al.type === "TP2_HIT" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : al.type === "ORDER_FILLED" ? (
                        <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                      ) : al.type === "SL_HIT" ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      {al.title}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(al.timestamp).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {al.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          EXPANDABLE CHAT & VALIDATION INTERFACE DENGAN AI ANALYST (BAGIAN ATAS)
         ===================================================================== */}
      {isChatOpen && (
        <div className="bg-[#0B0F17] border border-amber-500/40 rounded-2xl p-4 shadow-2xl space-y-3">
          {/* Header Chat */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  AI Institutional Gold Analyst • Chat & Validasi
                </h4>
                <p className="text-[10px] font-mono text-slate-400">
                  Konsultasikan setup aktif, validasi confluence SMC, dan risiko news secara interaktif
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="text-slate-400 hover:text-white font-mono text-xs px-2 py-1 rounded bg-slate-800"
            >
              Tutup ✕
            </button>
          </div>

          {/* Quick Action Pills: Validasi Setup, Alasan Level, News */}
          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              Aksi Cepat:
            </span>

            <button
              type="button"
              disabled={isSending}
              onClick={() =>
                handleSendMessage(
                  "Tolong validasi setup aktif saat ini secara mendalam dari sudut pandang struktur pasar, probabilitas, dan risiko.",
                  "VALIDASI_SETUP"
                )
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition text-[11px]"
            >
              <CheckCircle2 className="w-3 h-3" />
              Validasi Setup Aktif
            </button>

            <button
              type="button"
              disabled={isSending}
              onClick={() =>
                handleSendMessage(
                  "Kenapa level Buy/Sell Limit ini yang dipilih dan bukan level harga lainnya?",
                  "KENAPA_LEVEL_INI"
                )
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 transition text-[11px]"
            >
              <Crosshair className="w-3 h-3" />
              Kenapa Entry di Level Ini?
            </button>

            <button
              type="button"
              disabled={isSending}
              onClick={() =>
                handleSendMessage(
                  "Bagaimana kondisi news USD hari ini dan apakah ada potensi spike yang perlu diwaspadai?",
                  "STATUS_NEWS"
                )
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition text-[11px]"
            >
              <Flame className="w-3 h-3" />
              Analisis Risiko News USD
            </button>
          </div>

          {/* Area Pesan Chat */}
          <div
            ref={chatScrollRef}
            className="h-64 sm:h-72 overflow-y-auto space-y-3 p-3 bg-[#070A0F] rounded-xl border border-slate-800/80 font-mono text-xs"
          >
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                      isUser
                        ? "bg-amber-500 text-slate-950 font-medium rounded-tr-none"
                        : "bg-[#111621] text-slate-200 border border-slate-800 rounded-tl-none"
                    }`}
                  >
                    {!isUser && (
                      <div className="text-[10px] text-amber-400 font-bold mb-1 flex items-center gap-1">
                        <Bot className="w-3 h-3" /> AI Analyst (XAU/USD)
                      </div>
                    )}
                    <p className="whitespace-pre-line text-xs sm:text-sm">
                      {msg.text}
                    </p>
                    <div
                      className={`text-[9px] mt-1 text-right ${
                        isUser ? "text-slate-900/70" : "text-slate-500"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-[#111621] border border-slate-800 rounded-2xl rounded-tl-none px-4 py-2.5 text-xs text-amber-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AI Analyst sedang memeriksa kondisi pasar...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Chat Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 pt-1 font-mono"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Tanyakan analisis atau validasi ke AI Analyst..."
              disabled={isSending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#070A0F] border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kirim</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

