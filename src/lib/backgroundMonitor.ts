import { fetchGoldCandles } from "./marketData";
import { preProcessMarketData } from "./indicators";
import { generateGoldSignalWithAI } from "./geminiAnalyst";
import { buildNewsContext } from "./news";
import { evaluateTradeLifecycle } from "./tradeLifecycle";
import {
  appendSignalToHistory,
  getActiveSignal,
  getAppConfig,
  getEffectiveKeys,
  getSignalHistory,
  updateSignalInHistory,
} from "./signalStore";
import { AnalyzeGoldResponse, Timeframe } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __goldMonitorTimer: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __lastAutoSignalRunMs: number | undefined;
}

/**
 * Menjalankan siklus analisa lengkap:
 * Data pasar -> Indikator & Struktur (OB/FVG/BOS/CHoCH/Sweep) -> Konteks News -> AI memilih momen Buy/Sell Limit -> Simpan riwayat
 */
export async function executeGoldAnalysisCycle(options: {
  timeframe?: Timeframe;
  triggerType: "MANUAL" | "AUTO_24H";
  forceRefreshData?: boolean;
  skipAiGenerationIfRecent?: boolean;
}): Promise<AnalyzeGoldResponse> {
  const cfg = getAppConfig();
  const timeframe: Timeframe = options.timeframe || cfg.activeTimeframe || "M15";
  const {
    openaiApiKey,
    openaiModel,
    geminiApiKey,
    twelveDataApiKey,
    useOllama,
    ollamaModel,
    ollamaBaseUrl,
    aiProvider,
  } = getEffectiveKeys();

  // Tahap 2: Tarik data pasar XAU/USD
  const { candles, source } = await fetchGoldCandles(
    timeframe,
    twelveDataApiKey,
    Boolean(options.forceRefreshData)
  );

  // Tahap 3: Pra-pengolahan matematis (indikator + struktur pasar + kandidat limit)
  const { marketData, ema50Series, ema200Series } = preProcessMarketData(
    candles,
    timeframe,
    source
  );

  // Konteks news (kalender ekonomi nyata, fase news, spike pasca-rilis, skenario)
  const news = await buildNewsContext({
    candles,
    atr: marketData.indicators.atr14,
    timeframe,
    isLiveData: !source.toLowerCase().includes("simulated"),
  });

  const responseConfig = {
    autoMonitorEnabled: cfg.autoMonitorEnabled,
    intervalMinutes: cfg.intervalMinutes,
    activeTimeframe: timeframe,
    openaiModel,
    hasOpenaiKey: Boolean(openaiApiKey),
    hasGeminiKey: Boolean(geminiApiKey),
    hasTwelveDataKey: Boolean(twelveDataApiKey),
    useOllama,
    ollamaModel,
    ollamaBaseUrl,
  };

  const existingHistory = getSignalHistory(50);
  const latestSameTf = existingHistory.find((s) => s.timeframe === timeframe);
  const nowMs = Date.now();

  // Saat halaman baru dibuka: pakai sinyal terakhir bila masih baru (<2 menit) & belum tuntas/batal
  const isRecentValid =
    latestSameTf &&
    latestSameTf.orderType !== undefined &&
    latestSameTf.tradeStatus !== "CANCELLED_INVALIDATED" &&
    latestSameTf.tradeStatus !== "CLOSED_TP1" &&
    latestSameTf.tradeStatus !== "CLOSED_TP2" &&
    latestSameTf.tradeStatus !== "CLOSED_SL" &&
    nowMs - new Date(latestSameTf.timestamp).getTime() < 2 * 60 * 1000;

  if (options.skipAiGenerationIfRecent && isRecentValid) {
    return {
      success: true,
      marketData,
      candles,
      ema50Series,
      ema200Series,
      signal: latestSameTf,
      history: existingHistory,
      news,
      config: responseConfig,
    };
  }

  // Tahap 4: AI memilih momen Buy/Sell Limit terbaik (Ollama Local / OpenAI / Gemini / SMC)
  const signal = await generateGoldSignalWithAI(marketData, news, {
    openaiApiKey,
    openaiModel,
    geminiApiKey,
    triggerType: options.triggerType,
    useOllama,
    ollamaModel,
    ollamaBaseUrl,
    aiProvider,
  });

  const updatedHistory = appendSignalToHistory(signal);

  if (options.triggerType === "AUTO_24H") {
    globalThis.__lastAutoSignalRunMs = nowMs;
  }

  return {
    success: true,
    marketData,
    candles,
    ema50Series,
    ema200Series,
    signal,
    history: updatedHistory,
    news,
    config: responseConfig,
  };
}

/**
 * Mesin Pemantau Latar Belakang 24 Jam (Trade-Driven Event Loop)
 * TIDAK membuat sinyal sembarangan per 5 menit jika posisi sedang aktif.
 * Mengawal order hingga menyentuh TP atau SL sebelum memicu analisa baru!
 */
export function ensureBackgroundMonitorStarted(): void {
  if (globalThis.__goldMonitorTimer) {
    return;
  }

  globalThis.__lastAutoSignalRunMs = Date.now();

  globalThis.__goldMonitorTimer = setInterval(async () => {
    try {
      const cfg = getAppConfig();
      if (!cfg.autoMonitorEnabled) {
        return;
      }

      const currentTf: Timeframe = cfg.activeTimeframe || "M15";
      const active = getActiveSignal(currentTf);

      // 1. JIKA ADA POSISI LIMIT ORDER AKTIF (BUY_LIMIT / SELL_LIMIT):
      if (
        active &&
        (active.signal === "BUY" || active.signal === "SELL") &&
        active.orderType !== "NONE"
      ) {
        const currentStatus = active.tradeStatus || "WAITING_FILL";

        // JIKA STATUS MASIH BERJALAN (WAITING_FILL atau FILLED_IN_POSITION):
        if (
          currentStatus === "WAITING_FILL" ||
          currentStatus === "FILLED_IN_POSITION"
        ) {
          // Hanya tarik data harga terbaru untuk mengecek apakah TP atau SL sudah kena
          const { candles } = await fetchGoldCandles(
            currentTf,
            "",
            false
          );
          const lastCandle = candles[candles.length - 1];
          if (!lastCandle) return;

          const spotPrice = lastCandle.close;
          const { updatedSignal, statusChanged, isTradeResolved } =
            evaluateTradeLifecycle(active, spotPrice);

          if (statusChanged) {
            updateSignalInHistory(updatedSignal);
          }

          // HANYA JIKA TRADE BARU SAJA TUNTAS (Hit TP2, Hit SL, atau Batal):
          if (isTradeResolved) {
            console.log(
              `[Background Trade Resolved]: ${updatedSignal.tradeStatus} @ $${spotPrice.toFixed(
                2
              )}. Memulai analisa baru untuk mencari momen berikutnya...`
            );
            await executeGoldAnalysisCycle({
              timeframe: cfg.activeTimeframe || "M15",
              triggerType: "AUTO_24H",
              forceRefreshData: true,
            });
          }

          // POSISI SEDANG BERJALAN: JANGAN TIMPA DENGAN SINYAL BARU!
          return;
        }
      }

      // 2. POSISI TIDAK AKTIF:
      // Analisa TIDAK dijalankan otomatis di latar belakang agar tidak memenuhi riwayat.
      // Analisa hanya berjalan saat diminta (on-demand) oleh trader via tombol atau saat ganti timeframe.
      return;
    } catch (err) {
      console.error("[Background Price Monitor Error]:", err);
    }
  }, 10 * 1000); // Evaluasi lifecycle posisi setiap 10 detik tanpa memicu sinyal baru
}
