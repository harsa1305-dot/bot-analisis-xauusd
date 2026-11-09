import { NextRequest, NextResponse } from "next/server";
import {
  ensureBackgroundMonitorStarted,
  executeGoldAnalysisCycle,
} from "@/lib/backgroundMonitor";
import { saveAppConfig } from "@/lib/signalStore";
import { Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_TIMEFRAMES: Timeframe[] = ["M5", "M15", "H1", "H4"];

/**
 * GET /api/analyze-gold?timeframe=M15&mode=initial
 * Dipanggil saat halaman dibuka atau ketika polling sinkronisasi
 */
export async function GET(req: NextRequest) {
  ensureBackgroundMonitorStarted();

  try {
    const { searchParams } = new URL(req.url);
    const tfParam = (searchParams.get("timeframe") || "M15") as Timeframe;
    const mode = searchParams.get("mode") || "initial";
    const timeframe: Timeframe = VALID_TIMEFRAMES.includes(tfParam)
      ? tfParam
      : "M15";

    saveAppConfig({ activeTimeframe: timeframe });

    const result = await executeGoldAnalysisCycle({
      timeframe,
      triggerType: mode === "auto" ? "AUTO_24H" : "MANUAL",
      forceRefreshData: mode !== "initial",
      skipAiGenerationIfRecent: mode === "initial",
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Gagal menganalisa pasar XAU/USD";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analyze-gold
 * Dipanggil ketika tombol "Analisa Ulang" diklik atau timer Auto-Monitor mengeksekusi analisa baru
 */
export async function POST(req: NextRequest) {
  ensureBackgroundMonitorStarted();

  try {
    const body = await req.json().catch(() => ({}));
    const tfParam = (body.timeframe || "M15") as Timeframe;
    const timeframe: Timeframe = VALID_TIMEFRAMES.includes(tfParam)
      ? tfParam
      : "M15";
    const triggerType: "MANUAL" | "AUTO_24H" =
      body.triggerType === "AUTO_24H" ? "AUTO_24H" : "MANUAL";

    saveAppConfig({ activeTimeframe: timeframe });

    const result = await executeGoldAnalysisCycle({
      timeframe,
      triggerType,
      forceRefreshData: true,
      skipAiGenerationIfRecent: false,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Gagal menjalankan analisa AI";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

