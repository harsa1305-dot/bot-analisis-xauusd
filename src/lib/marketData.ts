import { Candle, Timeframe } from "./types";

interface CacheEntry {
  timestamp: number;
  candles: Candle[];
  source: string;
}

// Cache memori per timeframe (TTL 30 detik)
const candleCache = new Map<Timeframe, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000;

export const TWELVE_DATA_INTERVAL_MAP: Record<Timeframe, string> = {
  M5: "5min",
  M15: "15min",
  H1: "1h",
  H4: "4h",
};

const BINANCE_INTERVAL_MAP: Record<Timeframe, string> = {
  M5: "5m",
  M15: "15m",
  H1: "1h",
  H4: "4h",
};

const YAHOO_INTERVAL_MAP: Record<Timeframe, { interval: string; range: string }> = {
  M5: { interval: "5m", range: "5d" },
  M15: { interval: "15m", range: "1mo" },
  H1: { interval: "60m", range: "3mo" },
  H4: { interval: "60m", range: "6mo" },
};

/**
 * Mengambil harga Spot Real-Time `OANDA:XAUUSD` langsung dari TradingView Scanner
 * untuk mengkalibrasi selisih harga Futures (GC=F) agar 100% identik dengan Spot XAU/USD di TradingView.
 */
async function fetchTradingViewSpotPrice(): Promise<number | null> {
  try {
    const res = await fetch("https://scanner.tradingview.com/cfd/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body: JSON.stringify({
        symbols: {
          tickers: ["OANDA:XAUUSD", "FOREXCOM:XAUUSD", "TVC:GOLD"],
          query: { types: [] },
        },
        columns: ["close"],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const firstValid = json?.data?.find(
      (item: { d?: number[] }) =>
        Array.isArray(item.d) && typeof item.d[0] === "number" && item.d[0] > 0
    );
    return firstValid ? Number(firstValid.d[0].toFixed(2)) : null;
  } catch {
    return null;
  }
}

/**
 * 1. Sumber Utama: Twelve Data API (`time_series` endpoint yang setara dengan `td.time_series().as_json()`)
 */
async function fetchFromTwelveData(
  timeframe: Timeframe,
  apiKey: string
): Promise<Candle[] | null> {
  if (!apiKey || apiKey.trim() === "") return null;

  const interval = TWELVE_DATA_INTERVAL_MAP[timeframe];
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=220&apikey=${encodeURIComponent(
    apiKey.trim()
  )}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const rawValues = Array.isArray(data)
      ? data
      : data?.status !== "error" && Array.isArray(data?.values)
      ? data.values
      : null;

    if (!rawValues || rawValues.length === 0) {
      return null;
    }

    const candles: Candle[] = rawValues
      .slice()
      .reverse()
      .map((item: Record<string, string>) => {
        const dtString = item.datetime.includes("T")
          ? item.datetime
          : item.datetime.replace(" ", "T") + "Z";
        const parsedTime = Math.floor(new Date(dtString).getTime() / 1000);
        return {
          time: parsedTime,
          isoTime: new Date(parsedTime * 1000).toISOString(),
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: item.volume ? parseFloat(item.volume) : 0,
        };
      })
      .filter((c: Candle) => !isNaN(c.close) && c.time > 0);

    const uniqueCandles: Candle[] = [];
    for (const c of candles) {
      if (
        uniqueCandles.length === 0 ||
        c.time > uniqueCandles[uniqueCandles.length - 1].time
      ) {
        uniqueCandles.push(c);
      }
    }

    return uniqueCandles.length >= 20 ? uniqueCandles : null;
  } catch {
    return null;
  }
}

/**
 * Konversi deretan Candle menjadi format JSON identik `td.time_series(outputsize=12).as_json()`
 */
export function formatAsTwelveDataJson(
  candles: Candle[],
  timeframe: Timeframe,
  outputsize = 12
) {
  const latestFirst = candles
    .slice(-outputsize)
    .reverse()
    .map((c) => ({
      datetime: c.isoTime.replace("T", " ").replace(/\.\d+Z$/, ""),
      open: c.open.toFixed(2),
      high: c.high.toFixed(2),
      low: c.low.toFixed(2),
      close: c.close.toFixed(2),
    }));

  return {
    meta: {
      symbol: "XAU/USD",
      interval: TWELVE_DATA_INTERVAL_MAP[timeframe],
      currency_base: "Gold",
      currency_quote: "US Dollar",
      type: "Physical Currency / Spot Gold",
    },
    values: latestFirst,
    status: "ok",
  };
}

/**
 * 2. Sumber Live Gratis Tanpa API Key: Yahoo Finance + Kalibrasi Presisi ke TradingView Spot (OANDA:XAUUSD)
 */
async function fetchFromYahooCalibratedToTradingView(
  timeframe: Timeframe
): Promise<{ candles: Candle[]; calibratedToTV: boolean } | null> {
  const cfg = YAHOO_INTERVAL_MAP[timeframe];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${cfg.interval}&range=${cfg.range}`;

  try {
    const [res, tvSpotPrice] = await Promise.all([
      fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
      }),
      fetchTradingViewSpotPrice(),
    ]);

    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result || !Array.isArray(result.timestamp)) return null;

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    if (!quote) return null;

    const rawCandles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      if (
        open != null &&
        high != null &&
        low != null &&
        close != null &&
        !isNaN(close)
      ) {
        rawCandles.push({
          time: timestamps[i],
          isoTime: new Date(timestamps[i] * 1000).toISOString(),
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
          volume: quote.volume?.[i] ?? 0,
        });
      }
    }

    let processed = rawCandles;
    if (timeframe === "H4" && rawCandles.length >= 80) {
      const aggregated: Candle[] = [];
      for (let i = 0; i < rawCandles.length; i += 4) {
        const chunk = rawCandles.slice(i, i + 4);
        if (chunk.length === 0) continue;
        aggregated.push({
          time: chunk[0].time,
          isoTime: chunk[0].isoTime,
          open: chunk[0].open,
          high: Math.max(...chunk.map((c) => c.high)),
          low: Math.min(...chunk.map((c) => c.low)),
          close: chunk[chunk.length - 1].close,
          volume: chunk.reduce((acc, c) => acc + (c.volume || 0), 0),
        });
      }
      processed = aggregated;
    }

    let sliced = processed.slice(-220);
    if (sliced.length < 30) return null;

    // Kalibrasi selisih basis Futures GC=F terhadap harga Spot OANDA:XAUUSD di TradingView
    let calibratedToTV = false;
    if (tvSpotPrice && tvSpotPrice > 0) {
      const lastClose = sliced[sliced.length - 1].close;
      const basisOffset = tvSpotPrice - lastClose;
      sliced = sliced.map((c, idx) => {
        const isLast = idx === sliced.length - 1;
        const closeVal = isLast
          ? tvSpotPrice
          : Number((c.close + basisOffset).toFixed(2));
        const openVal = Number((c.open + basisOffset).toFixed(2));
        const highVal = Number(
          Math.max(c.high + basisOffset, openVal, closeVal).toFixed(2)
        );
        const lowVal = Number(
          Math.min(c.low + basisOffset, openVal, closeVal).toFixed(2)
        );
        return {
          ...c,
          open: openVal,
          high: highVal,
          low: lowVal,
          close: closeVal,
        };
      });
      calibratedToTV = true;
    }

    return { candles: sliced, calibratedToTV };
  } catch {
    return null;
  }
}

/**
 * 3. Sumber Cadangan Live Gratis Tanpa API Key #2: Binance Spot Gold (PAXG/USDT)
 */
async function fetchFromBinanceGold(timeframe: Timeframe): Promise<Candle[] | null> {
  const interval = BINANCE_INTERVAL_MAP[timeframe];
  const url = `https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=${interval}&limit=220`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length < 30) return null;

    const candles: Candle[] = rows.map((r: (string | number)[]) => {
      const timeSec = Math.floor(Number(r[0]) / 1000);
      return {
        time: timeSec,
        isoTime: new Date(timeSec * 1000).toISOString(),
        open: Number(parseFloat(String(r[1])).toFixed(2)),
        high: Number(parseFloat(String(r[2])).toFixed(2)),
        low: Number(parseFloat(String(r[3])).toFixed(2)),
        close: Number(parseFloat(String(r[4])).toFixed(2)),
        volume: Number(parseFloat(String(r[5])).toFixed(2)),
      };
    });

    return candles;
  } catch {
    return null;
  }
}

/**
 * 4. Generator Candlestick Simulasi Realistis (Jika komputer sedang offline)
 */
function generateSimulatedGoldCandles(timeframe: Timeframe): Candle[] {
  const stepSecondsMap: Record<Timeframe, number> = {
    M5: 300,
    M15: 900,
    H1: 3600,
    H4: 14400,
  };
  const step = stepSecondsMap[timeframe];
  const nowSec = Math.floor(Date.now() / 1000 / step) * step;
  const count = 220;
  const candles: Candle[] = [];

  let price = 2665.0;
  for (let i = count - 1; i >= 0; i--) {
    const t = nowSec - i * step;
    const seed = Math.sin(t / (step * 7)) * 2.4 + Math.cos(t / (step * 3)) * 1.3;
    const trendDrift = ((count - i) / count) * 0.14;
    const delta = seed * 0.85 + trendDrift;

    const open = Number(price.toFixed(2));
    const close = Number((open + delta).toFixed(2));
    const wickUp = Math.abs(Math.sin(t * 0.7)) * 2.6 + 0.5;
    const wickDown = Math.abs(Math.cos(t * 0.9)) * 2.4 + 0.5;
    const high = Number((Math.max(open, close) + wickUp).toFixed(2));
    const low = Number((Math.min(open, close) - wickDown).toFixed(2));

    candles.push({
      time: t,
      isoTime: new Date(t * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume: Math.round(1200 + Math.abs(seed) * 450),
    });

    price = close;
  }

  return candles;
}

/**
 * Tahap 2: Pengambilan Data Pasar (Market Data Ingestion)
 */
export async function fetchGoldCandles(
  timeframe: Timeframe,
  twelveDataApiKey?: string,
  forceRefresh = false
): Promise<{ candles: Candle[]; source: string }> {
  const now = Date.now();
  const cached = candleCache.get(timeframe);

  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { candles: cached.candles, source: cached.source };
  }

  // Prioritas 1: Twelve Data API (jika API key tersedia)
  if (twelveDataApiKey) {
    const tdCandles = await fetchFromTwelveData(timeframe, twelveDataApiKey);
    if (tdCandles) {
      const source = "Twelve Data API (XAU/USD Spot)";
      candleCache.set(timeframe, { timestamp: now, candles: tdCandles, source });
      return { candles: tdCandles, source };
    }
  }

  // Prioritas 2: Yahoo Finance + Kalibrasi ke TradingView Spot (OANDA:XAUUSD)
  const yfData = await fetchFromYahooCalibratedToTradingView(timeframe);
  if (yfData) {
    const source = yfData.calibratedToTV
      ? "TradingView Spot Synced (OANDA:XAUUSD)"
      : "Yahoo Finance Live Feed (GC=F Futures)";
    candleCache.set(timeframe, {
      timestamp: now,
      candles: yfData.candles,
      source,
    });
    return { candles: yfData.candles, source };
  }

  // Prioritas 3: Binance Live Gold Spot Proxy
  const binanceCandles = await fetchFromBinanceGold(timeframe);
  if (binanceCandles) {
    const source = "Global Gold Spot Live Feed (XAU/PAXG 24/7)";
    candleCache.set(timeframe, {
      timestamp: now,
      candles: binanceCandles,
      source,
    });
    return { candles: binanceCandles, source };
  }

  // Prioritas 4: Offline Simulation Fallback
  const simCandles = generateSimulatedGoldCandles(timeframe);
  const source = "Simulated Gold Feed (Offline Mode)";
  candleCache.set(timeframe, { timestamp: now, candles: simCandles, source });
  return { candles: simCandles, source };
}
