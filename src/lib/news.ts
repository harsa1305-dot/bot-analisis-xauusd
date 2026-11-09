import {
  Candle,
  NewsContext,
  NewsEvent,
  NewsPhase,
  NewsScenario,
  SpikeAnalysis,
  Timeframe,
} from "./types";

const FEED_URLS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];
const CACHE_TTL_MS = 10 * 60 * 1000;
const FEED_SOURCE = "Forex Factory Calendar (faireconomy feed)";

declare global {
  // eslint-disable-next-line no-var
  var __newsCache: { at: number; events: NewsEvent[] } | undefined;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Efek ke USD jika angka AKTUAL lebih tinggi dari forecast.
 * Emas bergerak berlawanan arah dengan USD pada reaksi pertama.
 */
function classifyUsdBias(title: string): NewsEvent["usdBiasIfAbove"] {
  const t = title.toLowerCase();
  if (/unemployment claims|unemployment rate|jobless/.test(t)) return "DOWN"; // lebih tinggi = ekonomi lemah
  if (/speaks|speech|testif|minutes|press conference|statement/.test(t)) return "NEUTRAL";
  if (
    /cpi|ppi|pce|retail sales|non-farm|nfp|employment change|adp|gdp|ism|pmi|average hourly|durable|jolts|housing starts|industrial production|interest rate|federal funds|fomc/.test(
      t
    )
  )
    return "UP";
  return "NEUTRAL";
}

export async function fetchNewsEvents(): Promise<{ events: NewsEvent[]; ok: boolean }> {
  const now = Date.now();
  if (globalThis.__newsCache && now - globalThis.__newsCache.at < CACHE_TTL_MS) {
    return { events: globalThis.__newsCache.events, ok: true };
  }

  const collected: NewsEvent[] = [];
  let anyOk = false;

  for (const url of FEED_URLS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (!Array.isArray(json)) continue;
      anyOk = true;
      for (const e of json) {
        if (e?.country !== "USD") continue;
        if (e?.impact !== "High" && e?.impact !== "Medium") continue;
        const timeMs = new Date(e.date).getTime();
        if (isNaN(timeMs)) continue;
        collected.push({
          title: String(e.title),
          country: "USD",
          timeMs,
          impact: e.impact,
          forecast: String(e.forecast ?? ""),
          previous: String(e.previous ?? ""),
          usdBiasIfAbove: classifyUsdBias(String(e.title)),
        });
      }
    } catch {
      // lanjut ke URL berikutnya
    }
  }

  if (!anyOk) {
    // pakai cache lama bila ada, lebih baik daripada tidak ada data sama sekali
    if (globalThis.__newsCache) return { events: globalThis.__newsCache.events, ok: true };
    return { events: [], ok: false };
  }

  collected.sort((a, b) => a.timeMs - b.timeMs);
  globalThis.__newsCache = { at: now, events: collected };
  return { events: collected, ok: true };
}

function buildScenario(e: NewsEvent): NewsScenario {
  const hasForecast = e.forecast.trim() !== "";
  let ifAbove: NewsScenario["ifAbove"];
  let ifBelow: NewsScenario["ifBelow"];

  if (e.usdBiasIfAbove === "UP") {
    ifAbove = {
      goldBias: "BEARISH",
      text: `Aktual > forecast${hasForecast ? ` (${e.forecast})` : ""} → USD menguat & ekspektasi suku bunga naik → emas cenderung TURUN (spike turun lalu bisa retrace).`,
    };
    ifBelow = {
      goldBias: "BULLISH",
      text: `Aktual < forecast${hasForecast ? ` (${e.forecast})` : ""} → USD melemah → emas cenderung NAIK (spike naik lalu bisa retrace).`,
    };
  } else if (e.usdBiasIfAbove === "DOWN") {
    ifAbove = {
      goldBias: "BULLISH",
      text: `Aktual > forecast${hasForecast ? ` (${e.forecast})` : ""} → ekonomi/tenaga kerja lebih lemah → USD melemah → emas cenderung NAIK.`,
    };
    ifBelow = {
      goldBias: "BEARISH",
      text: `Aktual < forecast${hasForecast ? ` (${e.forecast})` : ""} → data lebih kuat → USD menguat → emas cenderung TURUN.`,
    };
  } else {
    ifAbove = {
      goldBias: "MIXED",
      text: "Isi pernyataan (hawkish/dovish) menentukan arah - tidak ada angka forecast. Reaksi sulit diprediksi.",
    };
    ifBelow = {
      goldBias: "MIXED",
      text: "Nada dovish biasanya menguntungkan emas, nada hawkish menekan emas. Tunggu arah candle setelah headline.",
    };
  }

  const plan =
    e.impact === "High"
      ? "JANGAN pasang limit order 30 menit sebelum rilis (spread melebar & spike dua arah/whipsaw). Tunggu 10–20 menit setelah rilis sampai candle settle, lalu cari limit di area retrace (50% spike / OB / FVG yang terbentuk)."
      : "Dampak sedang: kurangi ukuran lot dan hindari limit tepat di menit rilis.";

  return {
    eventTitle: e.title,
    timeMs: e.timeMs,
    impact: e.impact,
    forecast: e.forecast,
    previous: e.previous,
    ifAbove,
    ifBelow,
    plan,
  };
}

const TF_SECONDS: Record<Timeframe, number> = { M5: 300, M15: 900, H1: 3600, H4: 14400 };

/**
 * Deteksi spike setelah rilis news dari candle NYATA.
 * `reliable=false` bila timeframe terlalu besar untuk melihat spike (H4) atau data bukan feed live.
 */
export function analyzeSpike(
  candles: Candle[],
  event: NewsEvent,
  atr: number,
  timeframe: Timeframe,
  nowMs: number,
  isLiveData: boolean
): SpikeAnalysis {
  const minutesSince = Math.max(0, Math.round((nowMs - event.timeMs) / 60000));
  const tfSec = TF_SECONDS[timeframe];
  const eventSec = Math.floor(event.timeMs / 1000);
  const eventBucket = Math.floor(eventSec / tfSec) * tfSec;

  const base: SpikeAnalysis = {
    eventTitle: event.title,
    eventTimeMs: event.timeMs,
    minutesSince,
    spikeDetected: false,
    direction: "NONE",
    rangePts: 0,
    rangeAtr: 0,
    wickRejection: "NONE",
    retracedPct: 0,
    settled: false,
    reliable: isLiveData && timeframe !== "H4",
    summary: "",
  };

  const after = candles.filter((c) => c.time >= eventBucket);
  if (after.length === 0) {
    return { ...base, summary: "Belum ada candle setelah rilis news." };
  }

  const windowCandles = after.slice(0, Math.max(2, Math.ceil(2700 / tfSec) + 1)); // ± 45 menit pertama
  const hi = Math.max(...windowCandles.map((c) => c.high));
  const lo = Math.min(...windowCandles.map((c) => c.low));
  const range = hi - lo;
  const rangeAtr = atr > 0 ? range / atr : 0;
  const biggest = windowCandles.reduce((m, c) => (c.high - c.low > m.high - m.low ? c : m), windowCandles[0]);
  const bigRange = Math.max(biggest.high - biggest.low, 0.01);
  const upperWick = biggest.high - Math.max(biggest.open, biggest.close);
  const lowerWick = Math.min(biggest.open, biggest.close) - biggest.low;
  const wickRejection: SpikeAnalysis["wickRejection"] =
    upperWick / bigRange > 0.5 ? "UPPER" : lowerWick / bigRange > 0.5 ? "LOWER" : "NONE";

  const spikeDetected = rangeAtr >= 1.8;
  const direction: SpikeAnalysis["direction"] = !spikeDetected
    ? "NONE"
    : biggest.close >= biggest.open
    ? "UP"
    : "DOWN";

  const current = candles[candles.length - 1].close;
  let retracedPct = 0;
  if (spikeDetected) {
    retracedPct =
      direction === "UP" ? (hi - current) / Math.max(range, 0.01) : (current - lo) / Math.max(range, 0.01);
    retracedPct = Math.max(0, Math.min(1, retracedPct));
  }

  const last = candles[candles.length - 1];
  const settled = minutesSince >= 20 && last.high - last.low < atr * 0.9;

  let summary: string;
  if (!base.reliable) {
    summary =
      timeframe === "H4"
        ? "Timeframe H4 terlalu besar untuk menilai spike. Gunakan M5/M15 untuk analisis reaksi news."
        : "Data bukan feed live - analisis spike tidak dapat diandalkan.";
  } else if (!spikeDetected) {
    summary = `Tidak ada spike signifikan setelah ${event.title}: range ${r2(range)} pts (${r2(rangeAtr)}x ATR, ambang 1.8x). Reaksi pasar tergolong tenang.`;
  } else {
    summary = `SPIKE ${direction === "UP" ? "NAIK" : "TURUN"} setelah ${event.title}: range ${r2(range)} pts (${r2(rangeAtr)}x ATR)${
      wickRejection !== "NONE"
        ? `, dengan penolakan sumbu ${wickRejection === "UPPER" ? "atas" : "bawah"}`
        : ""
    }. Harga sudah retrace ${Math.round(retracedPct * 100)}% dari spike${settled ? " dan mulai settle." : " - belum settle, tunggu."}`;
  }

  return {
    ...base,
    spikeDetected,
    direction,
    rangePts: r2(range),
    rangeAtr: r2(rangeAtr),
    wickRejection,
    retracedPct: r2(retracedPct),
    settled,
    summary,
  };
}

export async function buildNewsContext(opts: {
  candles: Candle[];
  atr: number;
  timeframe: Timeframe;
  isLiveData: boolean;
}): Promise<NewsContext> {
  const nowMs = Date.now();
  const { events, ok } = await fetchNewsEvents();

  if (!ok) {
    return {
      available: false,
      source: FEED_SOURCE,
      fetchedAt: nowMs,
      events: [],
      phase: "UNKNOWN",
      minutesToNextHigh: null,
      minutesSinceLastHigh: null,
      nextHigh: null,
      lastHigh: null,
      caution: "Kalender ekonomi tidak dapat dimuat - risiko news TIDAK terpantau. Cek manual sebelum pasang limit.",
      spike: null,
      scenarios: [],
      guidance:
        "Kalender news tidak tersedia saat ini, jadi analisis tidak memperhitungkan jadwal rilis. Verifikasi manual di kalender ekonomi sebelum memasang limit order.",
    };
  }

  const highs = events.filter((e) => e.impact === "High");
  const nextHigh = highs.find((e) => e.timeMs > nowMs) ?? null;
  const lastHigh = [...highs].reverse().find((e) => e.timeMs <= nowMs) ?? null;

  const minutesToNextHigh = nextHigh ? Math.round((nextHigh.timeMs - nowMs) / 60000) : null;
  const minutesSinceLastHigh = lastHigh ? Math.round((nowMs - lastHigh.timeMs) / 60000) : null;

  // Kumpulkan semua high-impact di timestamp yang sama (mis. CPI + Core CPI) sebagai satu "rilis".
  let phase: NewsPhase = "CLEAR";
  let caution: string | null = null;

  if (minutesToNextHigh !== null && minutesToNextHigh <= 30) {
    phase = "PRE_NEWS";
    caution = `${nextHigh!.title} (High Impact) rilis ${minutesToNextHigh} menit lagi. Spread melebar & spike dua arah - HINDARI pasang limit order baru sekarang.`;
  } else if (minutesSinceLastHigh !== null && minutesSinceLastHigh <= 5) {
    phase = "NEWS_RELEASE";
    caution = `${lastHigh!.title} baru dirilis ${minutesSinceLastHigh} menit lalu. Pergerakan masih chaos (whipsaw) - tunggu candle settle.`;
  } else if (minutesSinceLastHigh !== null && minutesSinceLastHigh <= 45) {
    phase = "POST_NEWS_SETTLING";
    caution = `${lastHigh!.title} dirilis ${minutesSinceLastHigh} menit lalu. Fase pasca-news: cari limit di area retrace spike, bukan mengejar harga.`;
  }

  // Skenario: semua event High/Medium dalam 36 jam ke depan, terdekat dulu (maks 4)
  const horizonMs = 36 * 3600 * 1000;
  const upcoming = events.filter((e) => e.timeMs > nowMs - 5 * 60000 && e.timeMs - nowMs <= horizonMs).slice(0, 4);
  const scenarios = upcoming.map(buildScenario);

  let spike: SpikeAnalysis | null = null;
  if (lastHigh && minutesSinceLastHigh !== null && minutesSinceLastHigh <= 180) {
    spike = analyzeSpike(opts.candles, lastHigh, opts.atr, opts.timeframe, nowMs, opts.isLiveData);
  }

  let guidance: string;
  if (phase === "PRE_NEWS") {
    guidance = `Fase PRE-NEWS: ${nextHigh!.title} dalam ${minutesToNextHigh} menit. Keputusan wajib WAIT - jangan pasang limit order baru. Jika sudah punya limit aktif, pertimbangkan membatalkannya.`;
  } else if (phase === "NEWS_RELEASE") {
    guidance = `Fase RILIS NEWS: ${lastHigh!.title} baru keluar. Keputusan wajib WAIT sampai candle settle (sekitar 15–20 menit).`;
  } else if (phase === "POST_NEWS_SETTLING") {
    guidance = `Fase PASCA-NEWS (${minutesSinceLastHigh} menit setelah ${lastHigh!.title}). ${
      spike?.summary ?? ""
    } Limit order boleh dicari di area retrace/OB/FVG baru, dengan confidence diturunkan jika belum settle.`;
  } else if (nextHigh && minutesToNextHigh !== null && minutesToNextHigh <= 240) {
    guidance = `Tidak ada news dalam 30 menit ke depan, tetapi ${nextHigh.title} (High) rilis ${minutesToNextHigh} menit lagi. Limit boleh dipasang bila diperkirakan terisi sebelum itu; selain itu batalkan sebelum rilis.`;
  } else {
    guidance = "Tidak ada news High-Impact USD dalam waktu dekat. Analisis teknikal murni dapat dipakai.";
  }

  return {
    available: true,
    source: FEED_SOURCE,
    fetchedAt: nowMs,
    events: upcoming.length > 0 ? upcoming : events.slice(0, 6),
    phase,
    minutesToNextHigh,
    minutesSinceLastHigh,
    nextHigh,
    lastHigh,
    caution,
    spike,
    scenarios,
    guidance,
  };
}

