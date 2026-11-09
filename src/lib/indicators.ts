import {
  Candle,
  KeyLevels,
  LinePoint,
  PreProcessedMarketData,
  RecentCandleSummary,
  TechnicalIndicators,
  Timeframe,
} from "./types";
import { analyzeMarketStructure } from "./structure";

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Menghitung deret EMA (Exponential Moving Average) untuk visualisasi chart & nilai terakhir
 */
export function calculateEMASeries(candles: Candle[], period: number): LinePoint[] {
  if (candles.length === 0) return [];
  const k = 2 / (period + 1);
  const series: LinePoint[] = [];

  // Gunakan SMA pada N candle pertama sebagai seed jika cukup, atau close pertama
  let ema = candles[0].close;
  if (candles.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += candles[i].close;
    }
    ema = sum / period;
    for (let i = 0; i < period; i++) {
      // Sebelum periode penuh, gunakan running average agar garis chart tetap mulus
      let partialSum = 0;
      for (let j = 0; j <= i; j++) partialSum += candles[j].close;
      series.push({
        time: candles[i].time,
        value: round2(partialSum / (i + 1)),
      });
    }
    for (let i = period; i < candles.length; i++) {
      ema = candles[i].close * k + ema * (1 - k);
      series.push({
        time: candles[i].time,
        value: round2(ema),
      });
    }
  } else {
    for (let i = 0; i < candles.length; i++) {
      ema = i === 0 ? candles[0].close : candles[i].close * k + ema * (1 - k);
      series.push({
        time: candles[i].time,
        value: round2(ema),
      });
    }
  }

  return series;
}

/**
 * Menghitung RSI (14) dengan metode Wilder's Smoothing standar TradingView
 */
export function calculateRSI(candles: Candle[], period = 14): {
  currentRsi: number;
  prevRsi: number;
  slope: "RISING" | "FALLING" | "FLAT";
} {
  if (candles.length <= period + 1) {
    return { currentRsi: 50, prevRsi: 50, slope: "FLAT" };
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let prevRsi = 50;
  let currentRsi = 50;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (i === candles.length - 3) {
      const rsPrev = avgLoss === 0 ? 100 : avgGain / avgLoss;
      prevRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rsPrev);
    }
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  currentRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  const delta = currentRsi - prevRsi;
  const slope = delta > 1.2 ? "RISING" : delta < -1.2 ? "FALLING" : "FLAT";

  return {
    currentRsi: round2(currentRsi),
    prevRsi: round2(prevRsi),
    slope,
  };
}

/**
 * Menghitung ATR (Average True Range) untuk mengukur volatilitas & jarak aman Stop Loss
 */
export function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 2.5;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) {
    const avg = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    return round2(avg);
  }

  let atr =
    trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return round2(atr);
}

/**
 * Mendeteksi Swing High (Resistance) dan Swing Low (Support) terdekat menggunakan Pivot/Fractal
 */
export function detectKeyLevels(
  candles: Candle[],
  currentPrice: number,
  atr: number
): KeyLevels {
  const lookback = candles.slice(-100);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  // Deteksi fractal 5-bar (2 kiri, 2 kanan)
  for (let i = 2; i < lookback.length - 2; i++) {
    const c = lookback[i];
    const isSwingHigh =
      c.high >= lookback[i - 1].high &&
      c.high >= lookback[i - 2].high &&
      c.high >= lookback[i + 1].high &&
      c.high >= lookback[i + 2].high;

    const isSwingLow =
      c.low <= lookback[i - 1].low &&
      c.low <= lookback[i - 2].low &&
      c.low <= lookback[i + 1].low &&
      c.low <= lookback[i + 2].low;

    if (isSwingHigh) swingHighs.push(c.high);
    if (isSwingLow) swingLows.push(c.low);
  }

  // Filter resistance di atas harga saat ini (minimal berjarak 0.4 * ATR agar tidak terlalu rapat)
  const minGap = atr * 0.4;
  const resistancesAbove = swingHighs
    .filter((h) => h > currentPrice + minGap)
    .sort((a, b) => a - b);

  // Filter support di bawah harga saat ini
  const supportsBelow = swingLows
    .filter((l) => l < currentPrice - minGap)
    .sort((a, b) => b - a);

  const highestRecent = Math.max(...lookback.map((c) => c.high));
  const lowestRecent = Math.min(...lookback.map((c) => c.low));

  const nearestResistance = round2(
    resistancesAbove[0] ?? Math.max(highestRecent, currentPrice + atr * 2.0)
  );
  const majorResistance = round2(
    resistancesAbove[1] ??
      Math.max(nearestResistance + atr * 1.8, highestRecent + atr)
  );

  const nearestSupport = round2(
    supportsBelow[0] ?? Math.min(lowestRecent, currentPrice - atr * 2.0)
  );
  const majorSupport = round2(
    supportsBelow[1] ??
      Math.min(nearestSupport - atr * 1.8, lowestRecent - atr)
  );

  return {
    nearestResistance,
    majorResistance,
    nearestSupport,
    majorSupport,
    distanceToResistance: round2(nearestResistance - currentPrice),
    distanceToSupport: round2(currentPrice - nearestSupport),
    safeSlBuffer: round2(atr * 1.5),
  };
}

/**
 * Klasifikasi pola candlestick dari 5 candle terakhir
 */
export function summarizeRecentCandles(candles: Candle[]): RecentCandleSummary[] {
  const recent = candles.slice(-5);
  return recent.map((c, idx) => {
    const prev = idx > 0 ? recent[idx - 1] : c;
    const bodySize = Math.abs(c.close - c.open);
    const totalRange = Math.max(c.high - c.low, 0.01);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const isBull = c.close >= c.open;

    let pattern = isBull ? "BULLISH_CANDLE" : "BEARISH_CANDLE";

    if (bodySize / totalRange < 0.18) {
      pattern = "DOJI_INDECISION";
    } else if (lowerWick > bodySize * 1.8 && upperWick < bodySize * 0.8) {
      pattern = "BULLISH_PINBAR_REJECTION";
    } else if (upperWick > bodySize * 1.8 && lowerWick < bodySize * 0.8) {
      pattern = "BEARISH_SHOOTING_STAR";
    } else if (
      idx > 0 &&
      isBull &&
      prev.close < prev.open &&
      c.close > prev.open &&
      c.open <= prev.close
    ) {
      pattern = "BULLISH_ENGULFING";
    } else if (
      idx > 0 &&
      !isBull &&
      prev.close > prev.open &&
      c.close < prev.open &&
      c.open >= prev.close
    ) {
      pattern = "BEARISH_ENGULFING";
    } else if (bodySize / totalRange > 0.72) {
      pattern = isBull ? "STRONG_BULLISH_MARUBOZU" : "STRONG_BEARISH_MARUBOZU";
    }

    return {
      time: c.isoTime,
      open: round2(c.open),
      high: round2(c.high),
      low: round2(c.low),
      close: round2(c.close),
      bodySize: round2(bodySize),
      upperWick: round2(upperWick),
      lowerWick: round2(lowerWick),
      pattern,
    };
  });
}

/**
 * Tahap 3: Pra-Pengolahan & Hitung Indikator Matematika Murni
 */
export function preProcessMarketData(
  candles: Candle[],
  timeframe: Timeframe,
  dataSource: string
): {
  marketData: PreProcessedMarketData;
  ema50Series: LinePoint[];
  ema200Series: LinePoint[];
} {
  const ema50Series = calculateEMASeries(candles, 50);
  const ema200Series = calculateEMASeries(candles, 200);

  const lastCandle = candles[candles.length - 1];
  const currentPrice = round2(lastCandle.close);
  const ema50 = ema50Series[ema50Series.length - 1]?.value ?? currentPrice;
  const ema200 = ema200Series[ema200Series.length - 1]?.value ?? currentPrice;

  const { currentRsi, slope: rsiSlope } = calculateRSI(candles, 14);
  const atr14 = calculateATR(candles, 14);

  // Tentukan alignment tren berdasarkan EMA 50, EMA 200, dan posisi harga
  let trendAlignment: TechnicalIndicators["trendAlignment"] =
    "SIDEWAYS_CONSOLIDATION";
  let trendDescription = "Harga bergerak konsolidasi di sekitar rata-rata EMA";

  if (currentPrice > ema50 && ema50 > ema200) {
    trendAlignment = "STRONG_BULLISH";
    trendDescription =
      "Struktur Bullish Kuat (Harga > EMA 50 > EMA 200 / Golden Cross Aktif)";
  } else if (ema50 > ema200 && currentPrice <= ema50 && currentPrice >= ema200) {
    trendAlignment = "BULLISH_PULLBACK";
    trendDescription =
      "Tren Utama Bullish sedang melakukan Pullback/Koreksi ke area dinamis EMA 50–200";
  } else if (currentPrice < ema50 && ema50 < ema200) {
    trendAlignment = "STRONG_BEARISH";
    trendDescription =
      "Struktur Bearish Kuat (Harga < EMA 50 < EMA 200 / Death Cross Aktif)";
  } else if (ema50 < ema200 && currentPrice >= ema50 && currentPrice <= ema200) {
    trendAlignment = "BEARISH_PULLBACK";
    trendDescription =
      "Tren Utama Bearish sedang mengalami Pullback/Retracement ke area EMA 50–200";
  }

  let rsiZone: TechnicalIndicators["rsiZone"] = "NEUTRAL";
  if (currentRsi >= 70) rsiZone = "OVERBOUGHT";
  else if (currentRsi >= 55) rsiZone = "BULLISH_MOMENTUM";
  else if (currentRsi <= 30) rsiZone = "OVERSOLD";
  else if (currentRsi <= 45) rsiZone = "BEARISH_MOMENTUM";

  const avgPriceRatio = (atr14 / currentPrice) * 100;
  let volatilityState: TechnicalIndicators["volatilityState"] = "NORMAL";
  if (avgPriceRatio > 0.25) volatilityState = "HIGH_VOLATILITY";
  else if (avgPriceRatio < 0.06) volatilityState = "LOW";

  const keyLevels = detectKeyLevels(candles, currentPrice, atr14);
  const recentCandles = summarizeRecentCandles(candles);

  // Struktur pasar + kandidat Buy Limit / Sell Limit (momen entry berbasis zona & karakteristik spesifik tiap timeframe)
  const structure = analyzeMarketStructure({
    candles,
    currentPrice,
    atr: atr14,
    ema50,
    ema200,
    rsi14: currentRsi,
    keyLevels,
    timeframe,
    expiresInCandles: timeframe === "M5" ? 12 : timeframe === "M15" ? 8 : timeframe === "H1" ? 6 : 5,
  });

  // Statistik 24 jam / lookback terdekat
  const lookback24 = candles.slice(-Math.min(candles.length, 48));
  const firstOpen = lookback24[0]?.open ?? currentPrice;
  const priceChange24h = round2(currentPrice - firstOpen);
  const priceChangePercent24h = round2((priceChange24h / firstOpen) * 100);
  const high24h = round2(Math.max(...lookback24.map((c) => c.high)));
  const low24h = round2(Math.min(...lookback24.map((c) => c.low)));

  const marketData: PreProcessedMarketData = {
    symbol: "XAU/USD",
    dataSource,
    timeframe,
    timestamp: new Date().toISOString(),
    currentPrice,
    priceChange24h,
    priceChangePercent24h,
    high24h,
    low24h,
    indicators: {
      ema50,
      ema200,
      trendAlignment,
      trendDescription,
      rsi14: currentRsi,
      rsiZone,
      rsiSlope,
      atr14,
      volatilityState,
    },
    keyLevels,
    recentCandles,
    structure,
  };

  return { marketData, ema50Series, ema200Series };
}

