import { NextResponse } from "next/server";
import { getEffectiveKeys } from "@/lib/signalStore";

export const dynamic = "force-dynamic";

export interface LiveTickData {
  price: number;
  open24h?: number;
  high24h?: number;
  low24h?: number;
  change24h?: number;
  changePercent24h?: number;
  provider: string;
  quotes?: {
    oanda?: number;
    forexcom?: number;
    tvc?: number;
    fx_idc?: number;
  };
  updatedAtMs: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __fastGoldTickCache: LiveTickData | undefined;
  // eslint-disable-next-line no-var
  var __fastGoldTickLoop: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __isFetchingGoldTick: boolean | undefined;
}

/**
 * Menarik detak harga Spot Real-Time dari 4 Liquidity Provider Global di TradingView
 * (OANDA:XAUUSD, FOREXCOM:XAUUSD, TVC:GOLD, FX_IDC:XAUUSD) menggunakan koneksi Keep-Alive cepat.
 */
async function pullGlobalGoldTick(): Promise<LiveTickData | null> {
  try {
    const res = await fetch("https://scanner.tradingview.com/cfd/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Connection: "keep-alive",
      },
      body: JSON.stringify({
        symbols: {
          tickers: [
            "OANDA:XAUUSD",
            "FOREXCOM:XAUUSD",
            "TVC:GOLD",
            "FX_IDC:XAUUSD",
          ],
          query: { types: [] },
        },
        columns: ["close", "open", "high", "low", "change", "change_abs"],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(2200),
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json?.data) || json.data.length === 0) return null;

    const quotes: Record<string, number> = {};
    let primaryRow: { s: string; d: number[] } | null = null;

    for (const item of json.data) {
      if (Array.isArray(item?.d) && typeof item.d[0] === "number" && item.d[0] > 0) {
        const sym = String(item.s || "");
        const closeVal = Number(item.d[0].toFixed(2));
        if (sym.includes("OANDA")) quotes.oanda = closeVal;
        else if (sym.includes("FOREXCOM")) quotes.forexcom = closeVal;
        else if (sym.includes("TVC")) quotes.tvc = closeVal;
        else if (sym.includes("FX_IDC")) quotes.fx_idc = closeVal;

        if (!primaryRow) primaryRow = item;
      }
    }

    if (!primaryRow) return null;

    // Jika harga OANDA pada milidetik ini belum bergeser tetapi salah satu liquidity provider lain (FOREXCOM/TVC/FX_IDC) sudah bergerak duluan,
    // hitung micro-composite agar detak 0.5 detik selalu responsif terhadap likuiditas global
    const prevPrice = globalThis.__fastGoldTickCache?.price;
    let activePrice = Number(primaryRow.d[0].toFixed(2));
    let activeProvider = primaryRow.s || "OANDA:XAUUSD";

    if (prevPrice !== undefined && activePrice === prevPrice) {
      for (const item of json.data) {
        if (Array.isArray(item?.d) && typeof item.d[0] === "number") {
          const candidate = Number(item.d[0].toFixed(2));
          if (candidate !== prevPrice && Math.abs(candidate - activePrice) <= 1.8) {
            activePrice = candidate;
            activeProvider = item.s;
            break;
          }
        }
      }
    }

    const [, open, high, low, changePct, changeAbs] = primaryRow.d;

    return {
      price: activePrice,
      open24h: open ? Number(Number(open).toFixed(2)) : undefined,
      high24h: high ? Number(Number(high).toFixed(2)) : undefined,
      low24h: low ? Number(Number(low).toFixed(2)) : undefined,
      changePercent24h:
        typeof changePct === "number" ? Number(changePct.toFixed(2)) : undefined,
      change24h:
        typeof changeAbs === "number" ? Number(changeAbs.toFixed(2)) : undefined,
      provider: `Zero-Delay Global Spot (${activeProvider})`,
      quotes,
      updatedAtMs: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Menjalankan Background High-Speed Ticker (450ms) di memori server
 * sehingga setiap request `/api/live-tick` dari browser dibalas dalam < 2ms (Zero Delay)!
 */
function ensureHighSpeedTickerRunning() {
  if (globalThis.__fastGoldTickLoop) return;

  globalThis.__fastGoldTickLoop = setInterval(async () => {
    if (globalThis.__isFetchingGoldTick) return;
    globalThis.__isFetchingGoldTick = true;
    try {
      const tick = await pullGlobalGoldTick();
      if (tick) {
        globalThis.__fastGoldTickCache = tick;
      }
    } finally {
      globalThis.__isFetchingGoldTick = false;
    }
  }, 450);
}

export async function GET() {
  ensureHighSpeedTickerRunning();

  // Jika cache sudah ada di RAM, langsung kembalikan secara instan (< 2ms Zero Delay!)
  if (globalThis.__fastGoldTickCache) {
    return NextResponse.json({
      success: true,
      ...globalThis.__fastGoldTickCache,
      timestamp: Date.now(),
    });
  }

  // Hanya untuk panggilan pertama kali saat server baru menyala
  const firstTick = await pullGlobalGoldTick();
  if (firstTick) {
    globalThis.__fastGoldTickCache = firstTick;
    return NextResponse.json({
      success: true,
      ...firstTick,
      timestamp: Date.now(),
    });
  }

  const { twelveDataApiKey } = getEffectiveKeys();
  if (twelveDataApiKey) {
    try {
      const res = await fetch(
        `https://api.twelvedata.com/price?symbol=XAU/USD&apikey=${encodeURIComponent(
          twelveDataApiKey
        )}`,
        { cache: "no-store", signal: AbortSignal.timeout(2500) }
      );
      const data = await res.json();
      const p = parseFloat(data?.price);
      if (!isNaN(p) && p > 0) {
        const tdTick: LiveTickData = {
          price: Number(p.toFixed(2)),
          provider: "Twelve Data Live Spot (XAU/USD)",
          updatedAtMs: Date.now(),
        };
        globalThis.__fastGoldTickCache = tdTick;
        return NextResponse.json({
          success: true,
          ...tdTick,
          timestamp: Date.now(),
        });
      }
    } catch {
      // Ignore
    }
  }

  return NextResponse.json(
    { success: false, error: "Menghubungkan ke stream pasar global..." },
    { status: 503 }
  );
}
