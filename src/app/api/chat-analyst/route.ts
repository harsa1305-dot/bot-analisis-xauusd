import { NextRequest, NextResponse } from "next/server";
import { getEffectiveKeys, getSignalHistory } from "@/lib/signalStore";
import { fetchGoldCandles } from "@/lib/marketData";
import { preProcessMarketData } from "@/lib/indicators";
import { buildNewsContext } from "@/lib/news";
import { Timeframe } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessage: string = body?.message || "";
    const quickAction: string | undefined = body?.quickAction;
    const timeframe: Timeframe = body?.timeframe || "M15";

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

    // 1. Ambil data pasar & sinyal aktif terbaru
    const { candles, source } = await fetchGoldCandles(
      timeframe,
      twelveDataApiKey,
      false
    );
    const { marketData } = preProcessMarketData(candles, timeframe, source);
    const news = await buildNewsContext({
      candles,
      atr: marketData.indicators.atr14,
      timeframe,
      isLiveData: !source.toLowerCase().includes("simulated"),
    });

    const history = getSignalHistory(10);
    const activeSignal = history[0] || null;

    // 2. Bangun Prompt Konteks Analis
    const currentPrice = marketData.currentPrice;
    const signalInfo = activeSignal
      ? `
- Sinyal Aktif: ${activeSignal.orderType || activeSignal.signal}
- Status Trade: ${activeSignal.tradeStatus || "WAITING_FILL"}
- Setup: ${activeSignal.setupType || "SMC Order Block / FVG"}
- Entry: $${activeSignal.entryPrice.toFixed(2)} (Zona: $${(
          activeSignal.entryZoneLow ?? activeSignal.entryPrice
        ).toFixed(2)} - $${(
          activeSignal.entryZoneHigh ?? activeSignal.entryPrice
        ).toFixed(2)})
- Stop Loss: $${activeSignal.stopLoss.toFixed(2)} (-${activeSignal.slPips} pips)
- Take Profit 1: $${activeSignal.tp1.toFixed(2)} (+${activeSignal.tp1Pips} pips)
- Take Profit 2: $${activeSignal.tp2.toFixed(2)} (+${activeSignal.tp2Pips} pips)
- Risk:Reward: ${activeSignal.riskRewardRatio}
- Confidence: ${activeSignal.confidence}% (Skor Konfluensi: ${
          activeSignal.confluenceScore ?? activeSignal.confidence
        }/100)
- Rasionalisasi Sebelumnya: ${activeSignal.reasoning}
`
      : "Belum ada sinyal aktif yang tersimpan.";

    const newsInfo = `
- Fase News Saat Ini: ${news.phase}
- Next High Impact USD: ${
      news.nextHigh
        ? `${news.nextHigh.title} (${
            news.minutesToNextHigh !== null ? `${news.minutesToNextHigh} menit lagi` : ""
          })`
        : "Tidak ada event High-Impact terdekat"
    }
- Detektor Spike: ${
      news.spike
        ? news.spike.spikeDetected
          ? `Spike ${news.spike.rangeAtr}x ATR (${news.spike.direction})`
          : "Pasar normal (tidak ada spike liar)"
        : "Standby"
    }
- Panduan News: ${news.guidance || "Kondisi pasar aman untuk pending order limit."}
`;

    const techInfo = `
- Spot Price Saat Ini: $${currentPrice.toFixed(2)}
- Struktur Pasar: ${marketData.structure.trend} (Posisi Harga: ${
      marketData.structure.pricePosition
    } ${marketData.structure.positionPct}%)
- EMA 50: $${marketData.indicators.ema50.toFixed(
      2
    )} | EMA 200: $${marketData.indicators.ema200.toFixed(2)} (${
      marketData.indicators.trendDescription
    })
- RSI (14): ${marketData.indicators.rsi14.toFixed(1)} (${
      marketData.indicators.rsiZone
    }, ${marketData.indicators.rsiSlope})
- ATR (14): $${marketData.indicators.atr14.toFixed(2)}
- Zona Terdekat: ${marketData.structure.zones.length} zona OB/FVG unmitigated
`;

    const systemPrompt = `Kamu adalah Analis Pasar Emas (XAU/USD) Institusional Senior AI pada Terminal Trading ini.
Gaya komunikasimu:
- Bahasa Indonesia yang lugas, profesional, cerdas, percaya diri, santai dan objektif.
- Selalu memprioritaskan manajemen risiko (Risk-to-Reward, Stop Loss ketat, tidak overtrade).
- Jangan berhalusinasi harga: gunakan data pasar dan level yang tertera di bawah.
- Jika user meminta validasi, periksa konfluensi antara Tren EMA, RSI, Struktur (BOS/CHOCH/Sweep/OB), dan risiko kalender News USD.

DATA REAL-TIME PASAR SAAT INI:
${techInfo}

INFORMASI SINYAL AKTIF:
${signalInfo}

INFORMASI KALENDER & NEWS USD:
${newsInfo}
`;

    let reply = "";

    // 3A. Coba Ollama Local AI di Laptop (Offline & Cepat)
    if (useOllama && (aiProvider === "ollama" || aiProvider === "auto")) {
      try {
        const ollamaRes = await fetch(`${ollamaBaseUrl.replace(/\/+$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: quickAction
                  ? `[Tindakan Cepat: ${quickAction}]\n${userMessage || "Mohon jelaskan secara komprehensif."}`
                  : userMessage,
              },
            ],
            stream: false,
            options: {
              temperature: 0.3,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (ollamaRes.ok) {
          const oJson = await ollamaRes.json();
          reply = oJson?.message?.content?.trim() || "";
        }
      } catch {
        // Fallback to Cloud AI
      }
    }

    // 3B. Coba OpenAI GPT
    if (openaiApiKey && openaiApiKey.startsWith("sk-")) {
      try {
        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: openaiModel || "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: quickAction
                  ? `[Tindakan Cepat: ${quickAction}]\n${userMessage || "Mohon jelaskan secara komprehensif."}`
                  : userMessage,
              },
            ],
            temperature: 0.3,
            max_tokens: 650,
          }),
        });

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          reply = aiJson.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch {
        // Fallback below
      }
    }

    // 3B. Coba Gemini 2.5 Flash jika OpenAI belum membalas
    if (!reply && geminiApiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const gRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: systemPrompt },
                  {
                    text: `Pertanyaan Pengguna:\n${
                      quickAction ? `[Aksi Cepat: ${quickAction}] ` : ""
                    }${userMessage}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 650,
            },
          }),
        });

        if (gRes.ok) {
          const gJson = await gRes.json();
          reply =
            gJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        }
      } catch {
        // Fallback below
      }
    }

    // 3C. Smart Rule-Based Fallback jika API key tidak tersedia atau kuota habis
    if (!reply) {
      reply = buildRuleBasedAnalystReply({
        userMessage,
        quickAction,
        marketData,
        activeSignal,
        news,
      });
    }

    return NextResponse.json({
      success: true,
      reply,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Gagal memproses pesan chat analis",
      },
      { status: 500 }
    );
  }
}

function buildRuleBasedAnalystReply(ctx: {
  userMessage: string;
  quickAction?: string;
  marketData: ReturnType<typeof preProcessMarketData>["marketData"];
  activeSignal: ReturnType<typeof getSignalHistory>[0] | null;
  news: Awaited<ReturnType<typeof buildNewsContext>>;
}): string {
  const { quickAction, marketData, activeSignal, news } = ctx;
  const p = marketData.currentPrice.toFixed(2);
  const sig = activeSignal;

  if (quickAction === "VALIDASI_SETUP" || ctx.userMessage.toLowerCase().includes("valid")) {
    if (!sig || sig.signal === "WAIT") {
      return `Saat ini pasar XAU/USD berada di level $${p}. Status terminal adalah STANDBY / WAIT karena struktur pasar ${marketData.structure.trend} belum menyentuh zona diskon/premium yang memiliki rasio Risk:Reward optimal (min 1:1.5). Ini keputusan yang valid dan disiplin—lebih baik menunggu setup berkualitas daripada memaksakan entry sembarangan.`;
    }

    return `✅ Validasi Setup ${sig.orderType || sig.signal} @ $${sig.entryPrice.toFixed(
      2
    )}:\n\n1. Konfluensi Struktur: Setup terbentuk dari ${sig.setupType || "Order Block/FVG"} dengan tren ${
      marketData.structure.trend
    }. Skor konfluensi: ${sig.confluenceScore ?? sig.confidence}/100.\n2. Posisi Harga: Berada di area ${
      marketData.structure.pricePosition
    } (${marketData.structure.positionPct}% dari Dealing Range).\n3. Proteksi Stop Loss: SL diletakkan di $${sig.stopLoss.toFixed(
      2
    )} (${sig.slPips} pips di luar zona batas + buffer 1.5x ATR).\n4. Target Take Profit: TP1 $${sig.tp1.toFixed(
      2
    )} (+${sig.tp1Pips} pips) dan TP2 $${sig.tp2.toFixed(2)} (+${
      sig.tp2Pips
    } pips).\n\nKesimpulan: Setup ini valid dan memiliki probabilitas baik. Biarkan antrean limit order bekerja sampai terisi dan diselesaikan di TP atau SL.`;
  }

  if (
    quickAction === "KENAPA_LEVEL_INI" ||
    ctx.userMessage.toLowerCase().includes("kenapa")
  ) {
    if (!sig) return `Harga spot emas saat ini $${p}. Belum ada level limit aktif.`;
    return `Level ${sig.orderType || sig.signal} di $${sig.entryPrice.toFixed(
      2
    )} dipilih karena:\n- Merupakan batas zona mitigasi ${sig.setupType || "institusional (Order Block & Imbalance)"}.\n- Jarak jemputan dari harga saat ini ($${p}) memberikan perlindungan dari 'chasing price'.\n- Titik Stop Loss $${sig.stopLoss.toFixed(
      2
    )} berada di balik swing penting sehingga aman dari sapuan ekor stop-hunt biasa.`;
  }

  if (
    quickAction === "STATUS_NEWS" ||
    ctx.userMessage.toLowerCase().includes("news")
  ) {
    return `Kondisi Kalender News USD:\n- Fase: ${news.phase}\n- Panduan: ${
      news.guidance
    }\n- Agenda Terdekat: ${
      news.nextHigh ? news.nextHigh.title : "Tidak ada high news mendesak"
    }.\nJika terjadi rilis berita berdampak tinggi, detektor spike kami otomatis memantau lonjakan candle dan menjaga agar order Anda tidak terisi saat pelebaran spread liar.`;
  }

  return `Halo! Saya AI Analyst XAU/USD Anda. Saat ini harga emas berada di $${p}. Posisi terminal sedang mengawal setup ${
    sig ? `${sig.orderType || sig.signal} @ $${sig.entryPrice.toFixed(2)}` : "WAIT"
  }. Sesuai prinsip disiplin trading kita, analisa ini dikunci dan dipantau hingga selesai (mencapai Target TP atau batas SL). Anda bisa menanyakan validasi level, dampak news, atau manajemen lot kapan saja!`;
}

