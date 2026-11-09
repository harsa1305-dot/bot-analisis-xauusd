import { GoogleGenAI, Type } from "@google/genai";
import { generateWithOllama } from "./ollamaClient";
import {
  AISignalResult,
  LimitCandidate,
  NewsContext,
  PreProcessedMarketData,
  SignalDecision,
} from "./types";

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

// Catat API key OpenAI yang kreditnya habis supaya analisa ulang tidak lambat.
const exhaustedOpenAiKeys = new Map<string, number>();
const EXHAUSTED_COOLDOWN_MS = 10 * 60 * 1000;

/** Skor konfluensi minimum agar sebuah momen layak dijadikan Buy/Sell Limit. */
const MIN_ACTIONABLE_SCORE = 38;

type Trigger = "MANUAL" | "AUTO_24H";

const GOLD_ANALYST_SYSTEM_PROMPT = `Kamu adalah analis XAU/USD (Gold) institusional tingkat lanjut yang bertugas memberikan ACTIONABLE PENDING LIMIT ORDER (BUY LIMIT atau SELL LIMIT) dengan presisi SMC/ICT (Order Block, Fair Value Gap, Liquidity Sweeps, dealing range premium/discount).

PASAR EMAS ADALAH PASAR DUA ARAH (DUAL-DIRECTION):
1. Selalu pertimbangkan kedua sisi: BUY LIMIT di area Discount / Demand / Support, dan SELL LIMIT di area Premium / Supply / Resistance.
2. JANGAN PERNAH membiarkan trader dalam status WAIT tanpa order kecuali pasar sedang berada dalam fase rilis High-Impact News besar (CPI, NFP, FOMC) yang sedang berlangsung atau sesaat sebelum rilis.
3. Selalu PILIH kandidat terbaik dari daftar limit yang tersedia (TAKE_CANDIDATE) untuk dijadikan eksekusi utama (BUY LIMIT atau SELL LIMIT). DILARANG mengarang harga; gunakan id kandidat yang valid dari daftar.
4. Tentukan target TP1 dan TP2 pada level likuiditas yang masuk akal dan jelaskan level pembatalan (cancelLevel).
5. INDEPENDENSI ANALISIS PER TIMEFRAME (DATA-DRIVEN):
   Setiap timeframe memiliki dinamika candlestick, struktur, dan zona Order Block/FVG sendiri. Keputusan arah BUY LIMIT vs SELL LIMIT di SETIAP timeframe harus 100% murni ditentukan oleh analisis teknikal objektif pada timeframe bersangkutan (posisi dealing range premium/discount, konfluensi likuiditas, EMA, dan RSI), BUKAN karena aturan pakem bahwa timeframe tertentu harus buy atau sell. M5, M15, H1, dan H4 masing-masing mengevaluasi peluang terbaiknya secara independen.
6. Berikan analisa profesional yang tajam dalam Bahasa Indonesia yang lugas dan percaya diri seperti AI Gold Trader institusional kelas dunia.`;

/* ------------------------------------------------------------------------- *
 * Payload ringkas untuk LLM
 * ------------------------------------------------------------------------- */
function buildLlmPayload(md: PreProcessedMarketData, news: NewsContext) {
  const s = md.structure;
  return {
    symbol: md.symbol,
    timeframe: md.timeframe,
    timestamp: md.timestamp,
    currentPrice: md.currentPrice,
    indicators: md.indicators,
    keyLevels: md.keyLevels,
    marketStructure: {
      trend: s.trend,
      lastBreak: s.lastBreak,
      recentLiquiditySweeps: s.recentSweeps,
      dealingRange: { high: s.rangeHigh, low: s.rangeLow, equilibrium: s.equilibrium },
      pricePosition: s.pricePosition,
      positionPct: s.positionPct,
      freshZones: s.zones,
    },
    limitOrderCandidates: s.candidates.map((c) => ({
      id: c.id,
      orderType: c.orderType,
      setupType: c.setupType,
      entryZone: [c.entryLow, c.entryHigh],
      entry: c.entry,
      stopLoss: c.stopLoss,
      tp1: c.tp1,
      tp2: c.tp2,
      rr1: c.rr1,
      rr2: c.rr2,
      confluenceScore: c.score,
      distanceFromPrice: c.distanceFromPrice,
      cancelIfPriceReaches: c.cancelLevel,
      reasons: c.reasons,
    })),
    recentCandles: md.recentCandles,
    news: {
      available: news.available,
      phase: news.phase,
      guidance: news.guidance,
      minutesToNextHighImpact: news.minutesToNextHigh,
      nextHighImpact: news.nextHigh
        ? {
            title: news.nextHigh.title,
            forecast: news.nextHigh.forecast,
            previous: news.nextHigh.previous,
          }
        : null,
      minutesSinceLastHighImpact: news.minutesSinceLastHigh,
      spikeAfterLastNews: news.spike,
      upcomingScenarios: news.scenarios.slice(0, 3).map((sc) => ({
        event: sc.eventTitle,
        impact: sc.impact,
        forecast: sc.forecast,
        previous: sc.previous,
        ifActualAboveForecast: sc.ifAbove.text,
        ifActualBelowForecast: sc.ifBelow.text,
      })),
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Perakitan hasil akhir dari kandidat terpilih
 * ------------------------------------------------------------------------- */
function newsHardBlock(news: NewsContext): boolean {
  return news.phase === "PRE_NEWS" || news.phase === "NEWS_RELEASE";
}

function assembleResult(args: {
  md: PreProcessedMarketData;
  news: NewsContext;
  candidate: LimitCandidate | null;
  /** kandidat terbaik untuk ditampilkan sebagai watchlist ketika WAIT */
  watchlist: LimitCandidate | null;
  alternative?: LimitCandidate | null;
  confidence: number;
  marketBias: string;
  reasoning: string;
  keyFactors: string[];
  aiEngine: AISignalResult["aiEngine"];
  aiModelName: string;
  triggerType: Trigger;
}): AISignalResult {
  const { md, news, candidate, watchlist } = args;
  const shown = candidate ?? watchlist;
  const price = md.currentPrice;
  const atr = md.indicators.atr14;

  const signal: SignalDecision = candidate
    ? candidate.orderType === "BUY_LIMIT"
      ? "BUY"
      : "SELL"
    : "WAIT";

  let entry: number;
  let sl: number;
  let tp1: number;
  let tp2: number;
  let rr: string;

  if (shown) {
    entry = shown.entry;
    sl = shown.stopLoss;
    tp1 = shown.tp1;
    tp2 = shown.tp2;
    rr = `1:${shown.rr2.toFixed(1)}`;
  } else {
    // Tidak ada zona valid sama sekali: tampilkan level referensi netral di sekitar harga.
    entry = price;
    sl = round2(price - atr * 1.5);
    tp1 = round2(price + atr * 1.5);
    tp2 = round2(price + atr * 2.5);
    rr = "-";
  }

  return {
    id: `sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    timeframe: md.timeframe,
    symbol: "XAU/USD",
    signal,
    orderType: candidate ? candidate.orderType : "NONE",
    setupType: shown?.setupType,
    confidence: Math.max(1, Math.min(100, Math.round(args.confidence))),
    currentPrice: price,
    entryPrice: entry,
    entryZoneLow: shown?.entryLow,
    entryZoneHigh: shown?.entryHigh,
    stopLoss: sl,
    tp1,
    tp2,
    slPips: Math.round(Math.abs(entry - sl) * 10),
    tp1Pips: Math.round(Math.abs(tp1 - entry) * 10),
    tp2Pips: Math.round(Math.abs(tp2 - entry) * 10),
    riskRewardRatio: rr,
    marketBias: args.marketBias,
    reasoning: args.reasoning,
    keyFactors: args.keyFactors.slice(0, 5),
    cancelLevel: shown?.cancelLevel,
    expiresInCandles: shown?.expiresInCandles,
    alternativeSetup: args.alternative ?? undefined,
    newsPhase: news.phase,
    newsImpact: news.nextHigh
      ? `${news.nextHigh.title} (${news.minutesToNextHigh} mnt lagi)`
      : news.lastHigh && news.minutesSinceLastHigh !== null && news.minutesSinceLastHigh <= 180
      ? `${news.lastHigh.title} (${news.minutesSinceLastHigh} mnt lalu)`
      : undefined,
    confluenceScore: shown?.score,
    aiEngine: args.aiEngine,
    aiModelName: args.aiModelName,
    triggerType: args.triggerType,
    indicatorsSnapshot: {
      ema50: md.indicators.ema50,
      ema200: md.indicators.ema200,
      rsi14: md.indicators.rsi14,
      atr14: md.indicators.atr14,
      nearestSupport: md.keyLevels.nearestSupport,
      nearestResistance: md.keyLevels.nearestResistance,
    },
  };
}

/** Pilih kandidat terbaik yang lolos aturan keras (news + skor minimum). */
function pickBestActionable(md: PreProcessedMarketData, news: NewsContext): {
  best: LimitCandidate | null;
  top: LimitCandidate | null;
  alternative: LimitCandidate | null;
  blockedByNews: boolean;
} {
  const cands = md.structure.candidates;
  const top = cands[0] ?? null;
  const blockedByNews = newsHardBlock(news);
  if (blockedByNews) return { best: null, top, alternative: null, blockedByNews };

  // Pasca-news yang belum settle: butuh konfluensi lebih tinggi.
  const minScore =
    news.phase === "POST_NEWS_SETTLING" && news.spike?.spikeDetected && !news.spike.settled
      ? MIN_ACTIONABLE_SCORE + 10
      : MIN_ACTIONABLE_SCORE;

  const best = cands.find((c) => c.score >= minScore) ?? top;
  const alternative = best
    ? cands.find((c) => c.orderType !== best.orderType) ?? null
    : null;

  return { best, top, alternative, blockedByNews };
}

function newsConfidencePenalty(news: NewsContext): number {
  if (news.phase === "POST_NEWS_SETTLING" && news.spike?.spikeDetected && !news.spike.settled) return 12;
  if (news.phase === "POST_NEWS_SETTLING") return 5;
  if (news.minutesToNextHigh !== null && news.minutesToNextHigh <= 90) return 6;
  return 0;
}

function describeNewsForText(news: NewsContext): string {
  const parts: string[] = [];
  if (news.caution) parts.push(news.caution);
  if (news.spike) parts.push(news.spike.summary);
  // Utamakan skenario High-Impact (CPI/NFP/FOMC) daripada pidato Medium-Impact.
  const sc = news.scenarios.find((s) => s.impact === "High") ?? news.scenarios[0];
  if (sc) {
    parts.push(
      `Skenario ${sc.eventTitle}${sc.forecast ? ` (forecast ${sc.forecast}, sebelumnya ${sc.previous || "-"})` : ""}: ${sc.ifAbove.text} ${sc.ifBelow.text}`
    );
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------------------- *
 * Mesin keputusan berbasis aturan (fallback tanpa LLM & jaring pengaman)
 * ------------------------------------------------------------------------- */
function runRuleBasedAnalysis(
  md: PreProcessedMarketData,
  news: NewsContext,
  triggerType: Trigger
): AISignalResult {
  const { best, top, alternative, blockedByNews } = pickBestActionable(md, news);
  const s = md.structure;
  const trendLabel =
    s.trend === "BULLISH" ? "Bullish (HH/HL)" : s.trend === "BEARISH" ? "Bearish (LH/LL)" : "Ranging";
  const newsText = describeNewsForText(news);

  if (best) {
    const side = best.orderType === "BUY_LIMIT" ? "BUY LIMIT" : "SELL LIMIT";
    const confidence = Math.min(92, Math.max(50, best.score - newsConfidencePenalty(news)));
    const reasoning =
      `Momen ${side} terdeteksi di $${best.entry} (zona $${best.entryLow}–$${best.entryHigh}) pada ${md.timeframe}. ` +
      `Struktur pasar ${trendLabel}, harga spot saat ini $${md.currentPrice} berada di area ${s.pricePosition} (${Math.round(s.positionPct * 100)}% dari range $${s.rangeLow}–$${s.rangeHigh}). ` +
      `Order dipasang sebagai pending limit menunggu harga kembali ke zona, bukan mengejar candle. ` +
      `SL $${best.stopLoss} di luar zona + buffer ATR, TP1 $${best.tp1} (RR 1:${best.rr1}) dan TP2 $${best.tp2} (RR 1:${best.rr2}). ` +
      `Batalkan order jika harga menyentuh $${best.cancelLevel} sebelum limit terisi. ` +
      (newsText ? `NEWS: ${newsText}` : "");

    return assembleResult({
      md,
      news,
      candidate: best,
      watchlist: null,
      alternative,
      confidence,
      marketBias: `${side} ${best.setupType}`,
      reasoning,
      keyFactors: best.reasons,
      aiEngine: "QUANT_FALLBACK_ENGINE",
      aiModelName: "Structure Engine (rule-based)",
      triggerType,
    });
  }

  // ---- WAIT ----
  let reason: string;
  if (blockedByNews) {
    reason = `WAIT karena fase news: ${news.caution ?? news.guidance}`;
  } else if (top) {
    reason = `Belum ada momen limit yang cukup kuat. Kandidat terbaik (${top.orderType === "BUY_LIMIT" ? "Buy Limit" : "Sell Limit"} @ ${top.entry}) hanya skor ${top.score}/100, di bawah ambang ${MIN_ACTIONABLE_SCORE}. Dijadikan watchlist saja.`;
  } else {
    reason = `Tidak ada zona Order Block / FVG yang masih fresh dan layak di sekitar harga ${md.currentPrice}. Struktur ${trendLabel}; tunggu pembentukan zona baru atau sweep likuiditas.`;
  }

  return assembleResult({
    md,
    news,
    candidate: null,
    watchlist: top,
    alternative,
    confidence: top ? Math.min(60, top.score) : 40,
    marketBias: blockedByNews ? "Tahan - fase news" : `Tunggu momen (${trendLabel})`,
    reasoning: `${reason} ${newsText}`.trim(),
    keyFactors: top ? top.reasons : [`Struktur ${trendLabel}`, `Posisi harga ${s.pricePosition}`],
    aiEngine: "QUANT_FALLBACK_ENGINE",
    aiModelName: "Structure Engine (rule-based)",
    triggerType,
  });
}

/* ------------------------------------------------------------------------- *
 * Menerapkan keputusan LLM dengan validasi ketat
 * ------------------------------------------------------------------------- */
interface LlmDecision {
  decision?: string;
  candidateId?: string;
  confidence?: number;
  marketBias?: string;
  reasoning?: string;
  keyFactors?: unknown;
  newsOutlook?: string;
}

function applyLlmDecision(
  parsed: LlmDecision,
  md: PreProcessedMarketData,
  news: NewsContext,
  engine: AISignalResult["aiEngine"],
  modelName: string,
  triggerType: Trigger
): AISignalResult {
  const cands = md.structure.candidates;
  const blockedByNews = newsHardBlock(news);
  const chosen =
    parsed.decision === "TAKE_CANDIDATE" && parsed.candidateId
      ? cands.find((c) => c.id === parsed.candidateId) ?? null
      : null;

  const reasoningBase = String(parsed.reasoning ?? "").trim();
  const newsOutlook = String(parsed.newsOutlook ?? "").trim();
  const factors = Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String) : [];
  const fullReasoning = [reasoningBase, newsOutlook ? `NEWS: ${newsOutlook}` : ""]
    .filter(Boolean)
    .join(" ");

  // Aturan keras: tidak ada limit baru saat news - override LLM bila perlu.
  if (blockedByNews) {
    return assembleResult({
      md,
      news,
      candidate: null,
      watchlist: chosen ?? cands[0] ?? null,
      confidence: 45,
      marketBias: "Tahan - fase news",
      reasoning: `WAIT (aturan keamanan news): ${news.caution ?? news.guidance} ${fullReasoning}`.trim(),
      keyFactors: factors,
      aiEngine: engine,
      aiModelName: modelName,
      triggerType,
    });
  }

  if (chosen) {
    const cap = Math.min(95, chosen.score + 15);
    const conf = Math.max(
      40,
      Math.min(cap, Number(parsed.confidence) || chosen.score) - newsConfidencePenalty(news)
    );
    const alt = cands.find((c) => c.orderType !== chosen.orderType) ?? null;
    return assembleResult({
      md,
      news,
      candidate: chosen,
      watchlist: null,
      alternative: alt,
      confidence: conf,
      marketBias: String(parsed.marketBias || chosen.setupType),
      reasoning: fullReasoning || `Momen ${chosen.orderType} di ${chosen.entry}.`,
      keyFactors: factors.length > 0 ? factors : chosen.reasons,
      aiEngine: engine,
      aiModelName: modelName,
      triggerType,
    });
  }

  // Jika LLM memilih WAIT tetapi kondisi pasar normal (tidak ada halangan news) dan ada kandidat limit SMC yang valid:
  const fallbackCandidate = cands.find((c) => c.score >= MIN_ACTIONABLE_SCORE) ?? cands[0] ?? null;
  if (fallbackCandidate) {
    const side = fallbackCandidate.orderType === "BUY_LIMIT" ? "BUY LIMIT" : "SELL LIMIT";
    const alt = cands.find((c) => c.orderType !== fallbackCandidate.orderType) ?? null;
    return assembleResult({
      md,
      news,
      candidate: fallbackCandidate,
      watchlist: null,
      alternative: alt,
      confidence: Math.max(50, Math.min(88, fallbackCandidate.score)),
      marketBias: `${side} ${fallbackCandidate.setupType}`,
      reasoning: `${fullReasoning ? fullReasoning + " | " : ""}SMC Analysis merekomendasikan ${side} @ $${fallbackCandidate.entry} (SL $${fallbackCandidate.stopLoss}, TP1 $${fallbackCandidate.tp1}).`,
      keyFactors: factors.length > 0 ? factors : fallbackCandidate.reasons,
      aiEngine: engine,
      aiModelName: modelName,
      triggerType,
    });
  }

  // LLM memilih WAIT (atau id tidak valid) → WAIT dengan watchlist terbaik
  return assembleResult({
    md,
    news,
    candidate: null,
    watchlist: cands[0] ?? null,
    confidence: Math.max(30, Math.min(65, Number(parsed.confidence) || 50)),
    marketBias: String(parsed.marketBias || "Tunggu momen yang lebih baik"),
    reasoning: fullReasoning || "Belum ada momen limit yang layak.",
    keyFactors: factors,
    aiEngine: engine,
    aiModelName: modelName,
    triggerType,
  });
}

/* ------------------------------------------------------------------------- *
 * OpenAI
 * ------------------------------------------------------------------------- */
const DECISION_SCHEMA_PROPS = {
  decision: { type: "string", enum: ["TAKE_CANDIDATE", "WAIT"] },
  candidateId: { type: "string" },
  confidence: { type: "number" },
  marketBias: { type: "string" },
  reasoning: { type: "string" },
  keyFactors: { type: "array", items: { type: "string" } },
  newsOutlook: { type: "string" },
} as const;

const DECISION_REQUIRED = [
  "decision",
  "candidateId",
  "confidence",
  "marketBias",
  "reasoning",
  "keyFactors",
  "newsOutlook",
];

async function generateWithOpenAI(
  md: PreProcessedMarketData,
  news: NewsContext,
  apiKey: string,
  model: string,
  triggerType: Trigger
): Promise<AISignalResult | null> {
  const key = apiKey.trim();
  const exhaustedAt = exhaustedOpenAiKeys.get(key);
  if (exhaustedAt && Date.now() - exhaustedAt < EXHAUSTED_COOLDOWN_MS) return null;

  const modelToUse = model || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: modelToUse,
      temperature: 0.2,
      messages: [
        { role: "system", content: GOLD_ANALYST_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analisa paket data XAU/USD berikut. Pilih kandidat limit order terbaik (via "id") atau WAIT. Untuk WAIT isi candidateId dengan "NONE".\n\n${JSON.stringify(
            buildLlmPayload(md, news),
            null,
            2
          )}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gold_limit_order_decision",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: DECISION_SCHEMA_PROPS,
            required: DECISION_REQUIRED,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429 && errText.includes("credit_balance_exhausted")) {
      exhaustedOpenAiKeys.set(key, Date.now());
    }
    return null;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;
  return applyLlmDecision(
    JSON.parse(content),
    md,
    news,
    "OPENAI_GPT",
    `OpenAI ${modelToUse.toUpperCase()}`,
    triggerType
  );
}

/* ------------------------------------------------------------------------- *
 * Entry point
 * ------------------------------------------------------------------------- */
export async function generateGoldSignalWithAI(
  marketData: PreProcessedMarketData,
  news: NewsContext,
  options: {
    openaiApiKey?: string;
    openaiModel?: string;
    geminiApiKey?: string;
    triggerType?: Trigger;
    useOllama?: boolean;
    ollamaModel?: string;
    ollamaBaseUrl?: string;
    aiProvider?: "auto" | "ollama" | "openai" | "gemini";
  }
): Promise<AISignalResult> {
  const triggerType = options.triggerType || "MANUAL";
  const openaiKey = options.openaiApiKey?.trim() || "";
  const geminiKey = options.geminiApiKey?.trim() || "";
  const useOllama = options.useOllama !== false;
  const ollamaModel = options.ollamaModel || "qwen2.5:3b";
  const ollamaBaseUrl = options.ollamaBaseUrl || "http://127.0.0.1:11434";
  const aiProvider = options.aiProvider || "auto";

  // 1. OLLAMA LOCAL AI (Prioritas utama jika provider dipilih atau mode AUTO & Ollama aktif)
  if ((aiProvider === "ollama" || aiProvider === "auto") && useOllama) {
    try {
      const ollamaResult = await generateWithOllama({
        systemPrompt: GOLD_ANALYST_SYSTEM_PROMPT,
        payload: buildLlmPayload(marketData, news),
        modelName: ollamaModel,
        baseUrl: ollamaBaseUrl,
        timeoutMs: 35000,
      });

      if (ollamaResult) {
        return applyLlmDecision(
          ollamaResult,
          marketData,
          news,
          "OLLAMA_LOCAL",
          `Ollama (${ollamaModel})`,
          triggerType
        );
      }
    } catch {
      // Lanjut ke fallback OpenAI / Gemini jika Ollama sedang sibuk / model belum diunduh
    }
  }

  // 2. OPENAI GPT (Cloud)
  if (aiProvider !== "ollama" && openaiKey) {
    try {
      const r = await generateWithOpenAI(
        marketData,
        news,
        openaiKey,
        options.openaiModel || "gpt-4o-mini",
        triggerType
      );
      if (r) return r;
    } catch {
      // lanjut ke fallback
    }
  }

  // 3. GEMINI FLASH (Cloud)
  if (aiProvider !== "ollama" && geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Analisa paket data XAU/USD berikut. Pilih kandidat limit order terbaik (via "id") atau WAIT. Untuk WAIT isi candidateId dengan "NONE".\n\n${JSON.stringify(
          buildLlmPayload(marketData, news),
          null,
          2
        )}`,
        config: {
          systemInstruction: GOLD_ANALYST_SYSTEM_PROMPT,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              decision: { type: Type.STRING, enum: ["TAKE_CANDIDATE", "WAIT"] },
              candidateId: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              marketBias: { type: Type.STRING },
              reasoning: { type: Type.STRING },
              keyFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
              newsOutlook: { type: Type.STRING },
            },
            required: DECISION_REQUIRED,
          },
        },
      });
      if (response.text) {
        return applyLlmDecision(
          JSON.parse(response.text),
          marketData,
          news,
          "GEMINI_2_5_FLASH",
          "Gemini 2.5 Flash",
          triggerType
        );
      }
    } catch {
      // lanjut ke fallback
    }
  }

  // 4. QUANT SMC STRUCTURE ENGINE (Fallback Deterministik Presisi Tinggi)
  return runRuleBasedAnalysis(marketData, news, triggerType);
}
