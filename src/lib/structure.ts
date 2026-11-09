import {
  Candle,
  KeyLevels,
  LimitCandidate,
  LiquiditySweep,
  MarketStructure,
  SmartZone,
  StructureBreak,
  SwingPoint,
  Timeframe,
} from "./types";

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Deteksi swing high/low (fractal) dengan `left`/`right` candle konfirmasi.
 * Swing baru terkonfirmasi setelah `right` candle berikutnya selesai, sehingga candle
 * yang sedang berjalan tidak pernah dianggap swing.
 */
export function detectSwings(candles: Candle[], left = 3, right = 3): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= left; k++) {
      if (candles[i - k].high >= c.high) isHigh = false;
      if (candles[i - k].low <= c.low) isLow = false;
    }
    for (let k = 1; k <= right; k++) {
      if (candles[i + k].high > c.high) isHigh = false;
      if (candles[i + k].low < c.low) isLow = false;
    }
    if (isHigh) swings.push({ index: i, time: c.time, price: c.high, type: "HIGH" });
    if (isLow) swings.push({ index: i, time: c.time, price: c.low, type: "LOW" });
  }
  return swings.sort((a, b) => a.index - b.index);
}

/**
 * Berjalan kronologis untuk menentukan tren + BOS/CHoCH berdasarkan CLOSE (bukan sumbu),
 * supaya sapuan likuiditas (wick) tidak dianggap breakout palsu.
 */
function walkStructure(
  candles: Candle[],
  swings: SwingPoint[],
  right: number
): { trend: "BULLISH" | "BEARISH" | "RANGING"; breaks: StructureBreak[] } {
  let trend: "BULLISH" | "BEARISH" | "RANGING" = "RANGING";
  let lastHigh: { price: number; used: boolean } | null = null;
  let lastLow: { price: number; used: boolean } | null = null;
  const breaks: StructureBreak[] = [];
  const n = candles.length;

  for (let j = 0; j < n; j++) {
    for (const s of swings) {
      if (s.index + right === j) {
        if (s.type === "HIGH") lastHigh = { price: s.price, used: false };
        else lastLow = { price: s.price, used: false };
      }
    }
    const close = candles[j].close;
    if (lastHigh && !lastHigh.used && close > lastHigh.price) {
      const type: "BOS" | "CHOCH" = trend === "BEARISH" ? "CHOCH" : "BOS";
      breaks.push({
        type,
        direction: "BULLISH",
        level: r2(lastHigh.price),
        time: candles[j].time,
        candlesAgo: n - 1 - j,
      });
      lastHigh.used = true;
      trend = "BULLISH";
    }
    if (lastLow && !lastLow.used && close < lastLow.price) {
      const type: "BOS" | "CHOCH" = trend === "BULLISH" ? "CHOCH" : "BOS";
      breaks.push({
        type,
        direction: "BEARISH",
        level: r2(lastLow.price),
        time: candles[j].time,
        candlesAgo: n - 1 - j,
      });
      lastLow.used = true;
      trend = "BEARISH";
    }
  }
  return { trend, breaks };
}

/**
 * Liquidity sweep: sumbu menembus swing sebelumnya TETAPI close kembali di dalam.
 * Ini ciri "stop hunt" - sering menjadi awal pembalikan.
 */
function detectSweeps(
  candles: Candle[],
  swings: SwingPoint[],
  atr: number,
  lookback = 40
): LiquiditySweep[] {
  const n = candles.length;
  const sweeps: LiquiditySweep[] = [];
  const start = Math.max(1, n - lookback);

  for (let j = start; j < n; j++) {
    const c = candles[j];
    // hanya swing yang sudah terkonfirmasi sebelum candle j
    const prior = swings.filter((s) => s.index + 3 < j);
    const highs = prior.filter((s) => s.type === "HIGH").slice(-4);
    const lows = prior.filter((s) => s.type === "LOW").slice(-4);

    for (const h of highs) {
      const wick = c.high - h.price;
      if (c.high > h.price && c.close < h.price && wick >= atr * 0.12) {
        sweeps.push({
          side: "BUY_SIDE",
          level: r2(h.price),
          time: c.time,
          candlesAgo: n - 1 - j,
          wickPts: r2(wick),
        });
        break;
      }
    }
    for (const l of lows) {
      const wick = l.price - c.low;
      if (c.low < l.price && c.close > l.price && wick >= atr * 0.12) {
        sweeps.push({
          side: "SELL_SIDE",
          level: r2(l.price),
          time: c.time,
          candlesAgo: n - 1 - j,
          wickPts: r2(wick),
        });
        break;
      }
    }
  }
  return sweeps.sort((a, b) => a.candlesAgo - b.candlesAgo).slice(0, 8);
}

/**
 * Order Block + Fair Value Gap yang MASIH FRESH (belum disentuh balik oleh harga).
 */
function detectZones(
  candles: Candle[],
  atr: number,
  scan = 90,
  swings: SwingPoint[] = []
): SmartZone[] {
  const n = candles.length;
  const zones: SmartZone[] = [];
  const start = Math.max(5, n - scan);

  for (let i = start; i < n - 1; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const prevMaxHigh = Math.max(...candles.slice(Math.max(0, i - 4), i).map((x) => x.high));
    const prevMinLow = Math.min(...candles.slice(Math.max(0, i - 4), i).map((x) => x.low));

    // ---- Displacement bullish -> Order Block bullish (candle bearish terakhir sebelum impuls)
    if (c.close > c.open && (body >= atr * 0.6 || c.close > prevMaxHigh)) {
      for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
        const ob = candles[k];
        if (ob.close < ob.open) {
          zones.push({
            kind: "OB",
            side: "BULLISH",
            low: r2(ob.low),
            high: r2(ob.high),
            time: ob.time,
            candlesAgo: n - 1 - k,
          });
          break;
        }
      }
    }
    // ---- Displacement bearish -> Order Block bearish
    if (c.close < c.open && (body >= atr * 0.6 || c.close < prevMinLow)) {
      for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
        const ob = candles[k];
        if (ob.close > ob.open) {
          zones.push({
            kind: "OB",
            side: "BEARISH",
            low: r2(ob.low),
            high: r2(ob.high),
            time: ob.time,
            candlesAgo: n - 1 - k,
          });
          break;
        }
      }
    }

    // ---- Fair Value Gap (3 candle: i-1, i, i+1)
    const a = candles[i - 1];
    const b = candles[i + 1];
    if (b.low > a.high && b.low - a.high >= atr * 0.2) {
      zones.push({
        kind: "FVG",
        side: "BULLISH",
        low: r2(a.high),
        high: r2(b.low),
        time: c.time,
        candlesAgo: n - 1 - i,
      });
    }
    if (b.high < a.low && a.low - b.high >= atr * 0.2) {
      zones.push({
        kind: "FVG",
        side: "BEARISH",
        low: r2(b.high),
        high: r2(a.low),
        time: c.time,
        candlesAgo: n - 1 - i,
      });
    }
  }

  // Tambahkan zona supply di Swing High terdekat (Bearish Resistance) & demand di Swing Low (Bullish Support)
  for (const sw of swings.slice(0, 8)) {
    if (sw.type === "HIGH") {
      zones.push({
        kind: "OB",
        side: "BEARISH",
        low: r2(sw.price - atr * 0.35),
        high: r2(sw.price + atr * 0.15),
        time: sw.time,
        candlesAgo: sw.index,
      });
    } else {
      zones.push({
        kind: "OB",
        side: "BULLISH",
        low: r2(sw.price - atr * 0.15),
        high: r2(sw.price + atr * 0.35),
        time: sw.time,
        candlesAgo: sw.index,
      });
    }
  }

  // Buang zona yang sudah termitigasi penuh
  const fresh = zones.filter((z) => {
    const formedIdx = n - 1 - z.candlesAgo;
    const mid = (z.low + z.high) / 2;
    const from = Math.min(n - 1, formedIdx + 2);
    for (let j = from; j < n; j++) {
      const cc = candles[j];
      if (z.side === "BULLISH") {
        if (cc.close < z.low) return false;
      } else {
        if (cc.close > z.high) return false;
      }
    }
    return true;
  });

  // dedup zona yang hampir identik
  const dedup: SmartZone[] = [];
  for (const z of fresh) {
    const dup = dedup.find(
      (d) =>
        d.kind === z.kind &&
        d.side === z.side &&
        Math.abs(d.low - z.low) < atr * 0.2 &&
        Math.abs(d.high - z.high) < atr * 0.2
    );
    if (!dup) dedup.push(z);
  }
  return dedup;
}

function overlaps(a: { low: number; high: number }, b: { low: number; high: number }): boolean {
  return a.low <= b.high && b.low <= a.high;
}

interface BuildParams {
  candles: Candle[];
  currentPrice: number;
  atr: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  trend: "BULLISH" | "BEARISH" | "RANGING";
  lastBreak: StructureBreak | null;
  sweeps: LiquiditySweep[];
  zones: SmartZone[];
  swings: SwingPoint[];
  rangeHigh: number;
  rangeLow: number;
  positionPct: number;
  expiresInCandles: number;
  keyLevels?: KeyLevels;
  timeframe?: Timeframe;
}

function buildCandidates(p: BuildParams): LimitCandidate[] {
  const { currentPrice: price, atr, timeframe = "M15" } = p;
  const out: LimitCandidate[] = [];
  const swingHighs = p.swings.filter((s) => s.type === "HIGH").map((s) => s.price);
  const swingLows = p.swings.filter((s) => s.type === "LOW").map((s) => s.price);

  for (const z of p.zones) {
    const isBuy = z.side === "BULLISH";
    const zoneMid = (z.low + z.high) / 2;
    // Entry limit diletakkan di tengah zona (consequent encroachment)
    const entry = r2(zoneMid);

    if (isBuy && entry >= price - atr * 0.1) continue; // buy limit harus di bawah harga
    if (!isBuy && entry <= price + atr * 0.1) continue; // sell limit harus di atas harga

    const dist = Math.abs(price - entry);
    // Batasan jarak per timeframe: M5 butuh zona dekat, H1/H4 lebih luas
    const maxDistAtr = timeframe === "M5" ? 4.5 : timeframe === "M15" ? 7 : 10;
    if (dist > atr * maxDistAtr || dist < 0.2) continue;

    const buffer = Math.max(
      atr * (timeframe === "M5" ? 0.35 : 0.45),
      timeframe === "M5" ? 0.8 : 1.2
    );
    const sl = isBuy ? r2(z.low - buffer) : r2(z.high + buffer);
    const risk = Math.abs(entry - sl);
    if (risk < (timeframe === "M5" ? 0.5 : 0.8)) continue;

    // TP berbasis likuiditas nyata ke arah target:
    let tp1: number;
    let tp2: number;
    let cancelLevel: number;
    let tpFromStructure = false;

    if (isBuy) {
      // Untuk Buy Limit: target berada di atas harga saat ini (swing high / range high)
      const validHighs = swingHighs
        .filter((t) => t >= price - atr * 0.1 && t > entry + risk * 1.2)
        .sort((a, b) => a - b);
      if (validHighs.length > 0) {
        tp1 = validHighs[0];
        tp2 = validHighs[1] ?? Math.max(tp1 + atr * 1.2, p.rangeHigh);
        tpFromStructure = true;
      } else {
        tp1 = Math.max(price + atr * (timeframe === "M5" ? 0.5 : 0.6), entry + risk * 1.8);
        tp2 = Math.max(tp1 + atr * 1.2, entry + risk * 2.8);
      }
      tp1 = r2(tp1);
      tp2 = r2(tp2);
      // Cancel level Buy Limit
      cancelLevel = r2(Math.max(price + atr * 1.6, tp1 + atr * 0.4));

      if (price <= sl) continue;
      if (price >= cancelLevel) continue;
    } else {
      // Untuk Sell Limit: target berada di bawah harga saat ini (swing low / range low)
      const validLows = swingLows
        .filter((t) => t <= price + atr * 0.1 && t < entry - risk * 1.2)
        .sort((a, b) => b - a);
      if (validLows.length > 0) {
        tp1 = validLows[0];
        tp2 = validLows[1] ?? Math.min(tp1 - atr * 1.2, p.rangeLow);
        tpFromStructure = true;
      } else {
        tp1 = Math.min(price - atr * (timeframe === "M5" ? 0.5 : 0.6), entry - risk * 1.8);
        tp2 = Math.min(tp1 - atr * 1.2, entry - risk * 2.8);
      }
      tp1 = r2(tp1);
      tp2 = r2(tp2);
      // Cancel level Sell Limit
      cancelLevel = r2(Math.min(price - atr * 1.6, tp1 - atr * 0.4));

      if (price >= sl) continue;
      if (price <= cancelLevel) continue;
    }

    const rr1 = Math.abs(tp1 - entry) / risk;
    const rr2 = Math.abs(tp2 - entry) / risk;
    if (rr1 < 0.8) continue;

    // ---------- Skor Konfluensi Obyektif Murni (Berdasarkan Struktur Pasar Nyata) ----------
    let score = 24; // dasar: zona fresh
    const reasons: string[] = [];
    const kindLabel = z.kind === "OB" ? "Order Block" : "Fair Value Gap";
    reasons.push(
      `${kindLabel} ${isBuy ? "bullish" : "bearish"} fresh di $${z.low}–$${z.high} (${z.candlesAgo} candle lalu)`
    );

    // 1. Kesesuaian Tren Struktur Pasar
    const withTrend =
      (isBuy && p.trend === "BULLISH") || (!isBuy && p.trend === "BEARISH");
    const againstTrend =
      (isBuy && p.trend === "BEARISH") || (!isBuy && p.trend === "BULLISH");
    if (withTrend) {
      score += 20;
      reasons.push(
        `Searah struktur tren ${p.trend === "BULLISH" ? "Bullish (HH/HL)" : "Bearish (LH/LL)"}`
      );
    } else if (againstTrend) {
      score -= 10;
      reasons.push(`Counter-trend terhadap struktur tren ${p.trend.toLowerCase()}`);
    } else {
      score += 10;
      reasons.push(`Pasar konsolidasi/sideways - pantulan batas support/resistance`);
    }

    // 2. Zona Premium vs Discount (Dealing Range)
    const entryPct = (entry - p.rangeLow) / Math.max(p.rangeHigh - p.rangeLow, 0.01);
    if (isBuy && entryPct <= 0.50) {
      score += 16;
      reasons.push(
        `Entry di zona DISCOUNT (${Math.round(entryPct * 100)}% dari range) - harga relatif murah`
      );
    } else if (!isBuy && entryPct >= 0.50) {
      score += 16;
      reasons.push(
        `Entry di zona PREMIUM (${Math.round(entryPct * 100)}% dari range) - harga relatif mahal`
      );
    } else {
      score -= 12;
      reasons.push(
        isBuy
          ? `Buy di area premium (${Math.round(entryPct * 100)}%) - kurang ideal`
          : `Sell di area discount (${Math.round(entryPct * 100)}%) - kurang ideal`
      );
    }

    // 3. Konfirmasi Struktur Break (CHoCH / BOS)
    if (
      p.lastBreak &&
      p.lastBreak.candlesAgo <= 40 &&
      ((isBuy && p.lastBreak.direction === "BULLISH") ||
        (!isBuy && p.lastBreak.direction === "BEARISH"))
    ) {
      score += p.lastBreak.type === "CHOCH" ? 15 : 10;
      reasons.push(
        `${p.lastBreak.type === "CHOCH" ? "CHoCH (pembalikan struktur)" : "BOS (kelanjutan struktur)"} ${p.lastBreak.direction.toLowerCase()} di $${p.lastBreak.level}`
      );
    }

    // 4. Konfirmasi Liquidity Sweep (Stop-Hunt)
    const relevantSweep = p.sweeps.find(
      (s) =>
        Math.abs(s.candlesAgo - z.candlesAgo) <= 6 &&
        (isBuy
          ? s.side === "SELL_SIDE" && Math.abs(s.level - z.low) <= atr * 1.2
          : s.side === "BUY_SIDE" && Math.abs(s.level - z.high) <= atr * 1.2)
    );
    if (relevantSweep) {
      score += 16;
      reasons.push(
        `Liquidity sweep ${relevantSweep.side === "SELL_SIDE" ? "di bawah" : "di atas"} $${relevantSweep.level} - likuiditas retail telah disapu`
      );
    }

    // 5. Overlap Konfluensi Zona (Order Block + Fair Value Gap)
    const other = p.zones.find(
      (o) => o !== z && o.side === z.side && o.kind !== z.kind && overlaps(o, z)
    );
    if (other) {
      score += 14;
      reasons.push(
        `Overlap konfluensi ${other.kind === "OB" ? "Order Block" : "FVG"} $${other.low}–$${other.high}`
      );
    }

    // 6. Konfluensi Indikator Dinamis (EMA 50 / EMA 200)
    const nearEma = [
      { n: "EMA 50", v: p.ema50 },
      { n: "EMA 200", v: p.ema200 },
    ].find((e) => e.v >= z.low - atr * 0.4 && e.v <= z.high + atr * 0.4);
    if (nearEma) {
      score += 8;
      reasons.push(`Konfluensi dinamis dengan ${nearEma.n} ($${r2(nearEma.v)})`);
    }

    if (tpFromStructure) {
      score += 6;
      reasons.push(
        `TP1 $${tp1} pada level swing ${isBuy ? "high" : "low"} likuiditas`
      );
    }

    if (dist <= atr * 3.0) {
      score += 6;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    if (score < 30) continue;

    const setupLabel = relevantSweep
      ? `${kindLabel} + Liquidity Sweep`
      : other
      ? "Order Block + FVG Confluence"
      : `${kindLabel} Retracement`;

    out.push({
      id: `${timeframe}-${z.kind}-${z.side}-${z.low}-${z.high}`,
      orderType: isBuy ? "BUY_LIMIT" : "SELL_LIMIT",
      setupType: `${timeframe} ${setupLabel}`,
      entryLow: z.low,
      entryHigh: z.high,
      entry,
      stopLoss: sl,
      tp1,
      tp2,
      rr1: r2(rr1),
      rr2: r2(rr2),
      score,
      reasons: reasons.slice(0, 6),
      distanceFromPrice: r2(dist),
      cancelLevel,
      expiresInCandles: p.expiresInCandles,
    });
  }

  // --- Jaminan Dual-Direction: Pastikan selalu tersedia kandidat BUY LIMIT & SELL LIMIT per timeframe ---
  const hasBuy = out.some((c) => c.orderType === "BUY_LIMIT");
  const hasSell = out.some((c) => c.orderType === "SELL_LIMIT");

  // Skor sintetis obyektif (berdasarkan posisi harga di dealing range & tren timeframe bersangkutan)
  const baseBuyScore = (p.trend === "BULLISH" ? 72 : 55) + (p.positionPct <= 0.50 ? 14 : -10);
  const baseSellScore = (p.trend === "BEARISH" ? 72 : 55) + (p.positionPct >= 0.50 ? 14 : -10);

  if (!hasBuy) {
    const discountTarget = r2(p.rangeLow + (p.rangeHigh - p.rangeLow) * 0.25);
    const buyEntry = r2(
      Math.min(
        price - Math.max(atr * (timeframe === "M5" ? 0.4 : 0.8), timeframe === "M5" ? 0.8 : 1.5),
        p.keyLevels?.nearestSupport ? Math.min(p.keyLevels.nearestSupport, price - 0.8) : discountTarget
      )
    );
    const buySl = r2(buyEntry - Math.max(atr * 0.7, timeframe === "M5" ? 1.5 : 2.2));
    const buyRisk = Math.abs(buyEntry - buySl);
    const buyTp1 = r2(Math.max(price + atr * 0.6, buyEntry + buyRisk * (timeframe === "M5" ? 1.5 : 2.0)));
    const buyTp2 = r2(buyTp1 + atr * 1.4);
    const buyCancel = r2(Math.max(price + atr * 1.8, buyTp1 + atr * 0.5));
    const buyDist = Math.abs(price - buyEntry);

    out.push({
      id: `${timeframe}-INST-BUY-LIMIT-${buyEntry}`,
      orderType: "BUY_LIMIT",
      setupType: `${timeframe} Institutional Demand / Range Support`,
      entryLow: r2(buyEntry - atr * 0.2),
      entryHigh: r2(buyEntry + atr * 0.2),
      entry: buyEntry,
      stopLoss: buySl,
      tp1: buyTp1,
      tp2: buyTp2,
      rr1: r2(Math.abs(buyTp1 - buyEntry) / buyRisk),
      rr2: r2(Math.abs(buyTp2 - buyEntry) / buyRisk),
      score: Math.max(40, Math.min(95, baseBuyScore)),
      reasons: [
        `${timeframe}: Zona demand institusional di area Discount ($${buyEntry})`,
        `Risk:Reward terukur 1:${r2(Math.abs(buyTp2 - buyEntry) / buyRisk)} dengan buffer stop loss`,
        p.trend === "BULLISH"
          ? `${timeframe}: Mengikuti aliran tren dominan`
          : `${timeframe}: Rebound pada support penting`,
      ],
      distanceFromPrice: r2(buyDist),
      cancelLevel: buyCancel,
      expiresInCandles: p.expiresInCandles,
    });
  }

  if (!hasSell) {
    const premiumTarget = r2(p.rangeHigh - (p.rangeHigh - p.rangeLow) * 0.25);
    const sellEntry = r2(
      Math.max(
        price + Math.max(atr * (timeframe === "M5" ? 0.35 : 0.6), timeframe === "M5" ? 0.6 : 1.5),
        p.keyLevels?.nearestResistance ? Math.max(p.keyLevels.nearestResistance, price + 0.8) : premiumTarget
      )
    );
    const sellSl = r2(sellEntry + Math.max(atr * 0.7, timeframe === "M5" ? 1.5 : 2.2));
    const sellRisk = Math.abs(sellSl - sellEntry);
    const sellTp1 = r2(Math.min(price - atr * 0.6, sellEntry - sellRisk * (timeframe === "M5" ? 1.5 : 2.0)));
    const sellTp2 = r2(sellTp1 - atr * 1.4);
    const sellCancel = r2(Math.min(price - atr * 1.8, sellTp1 - atr * 0.5));
    const sellDist = Math.abs(sellEntry - price);

    out.push({
      id: `${timeframe}-INST-SELL-LIMIT-${sellEntry}`,
      orderType: "SELL_LIMIT",
      setupType: `${timeframe} Institutional Supply / Range Resistance`,
      entryLow: r2(sellEntry - atr * 0.2),
      entryHigh: r2(sellEntry + atr * 0.2),
      entry: sellEntry,
      stopLoss: sellSl,
      tp1: sellTp1,
      tp2: sellTp2,
      rr1: r2(Math.abs(sellEntry - sellTp1) / sellRisk),
      rr2: r2(Math.abs(sellEntry - sellTp2) / sellRisk),
      score: Math.max(40, Math.min(95, baseSellScore)),
      reasons: [
        `${timeframe}: Zona supply di area Premium ($${sellEntry})`,
        `Risk:Reward terukur 1:${r2(Math.abs(sellEntry - sellTp2) / sellRisk)} dengan buffer stop loss`,
        p.trend === "BEARISH"
          ? `${timeframe}: Mengikuti aliran tren dominan`
          : `${timeframe}: Rejection batas atas range`,
      ],
      distanceFromPrice: r2(sellDist),
      cancelLevel: sellCancel,
      expiresInCandles: p.expiresInCandles,
    });
  }

  const buys = out
    .filter((c) => c.orderType === "BUY_LIMIT")
    .sort((a, b) => b.score - a.score);
  const sells = out
    .filter((c) => c.orderType === "SELL_LIMIT")
    .sort((a, b) => b.score - a.score);

  // Pertahankan kandidat Buy Limit & Sell Limit terbaik agar AI selalu punya opsi 2 arah
  const topBuys = buys.slice(0, 3);
  const topSells = sells.slice(0, 3);
  return [...topBuys, ...topSells].sort((a, b) => b.score - a.score);
}

/**
 * Analisis struktur pasar lengkap + kandidat Buy Limit / Sell Limit.
 */
export function analyzeMarketStructure(params: {
  candles: Candle[];
  currentPrice: number;
  atr: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  keyLevels: KeyLevels;
  timeframe?: Timeframe;
  expiresInCandles?: number;
}): MarketStructure {
  const { candles, currentPrice, atr, timeframe = "M15" } = params;
  const left = timeframe === "M5" ? 2 : 3;
  const right = timeframe === "M5" ? 2 : 3;
  const swings = detectSwings(candles, left, right);
  const { trend, breaks } = walkStructure(candles, swings, right);
  const lastBreak = breaks.length > 0 ? breaks[breaks.length - 1] : null;
  const sweeps = detectSweeps(candles, swings, atr);
  const zones = detectZones(candles, atr, 90, swings);

  const window = candles.slice(-80);
  const rangeHigh = r2(Math.max(...window.map((c) => c.high)));
  const rangeLow = r2(Math.min(...window.map((c) => c.low)));
  const equilibrium = r2((rangeHigh + rangeLow) / 2);
  const positionPct = Math.max(
    0,
    Math.min(1, (currentPrice - rangeLow) / Math.max(rangeHigh - rangeLow, 0.01))
  );
  const pricePosition: MarketStructure["pricePosition"] =
    positionPct > 0.55 ? "PREMIUM" : positionPct < 0.45 ? "DISCOUNT" : "EQUILIBRIUM";

  const candidates = buildCandidates({
    candles,
    currentPrice,
    atr,
    ema50: params.ema50,
    ema200: params.ema200,
    rsi14: params.rsi14,
    trend,
    lastBreak,
    sweeps,
    zones,
    swings,
    rangeHigh,
    rangeLow,
    positionPct,
    expiresInCandles: params.expiresInCandles ?? 8,
    keyLevels: params.keyLevels,
    timeframe,
  });

  return {
    trend,
    lastBreak,
    recentSweeps: sweeps,
    rangeHigh,
    rangeLow,
    equilibrium,
    pricePosition,
    positionPct: Math.round(positionPct * 100) / 100,
    swings: swings.slice(-10),
    zones: zones
      .sort((a, b) => a.candlesAgo - b.candlesAgo)
      .slice(0, 8),
    candidates,
  };
}
