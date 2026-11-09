import { NextRequest, NextResponse } from "next/server";
import {
  clearSignalHistory,
  getAppConfig,
  getEffectiveKeys,
  getSignalHistory,
  saveAppConfig,
} from "@/lib/signalStore";
import { ensureBackgroundMonitorStarted } from "@/lib/backgroundMonitor";
import { Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureBackgroundMonitorStarted();
  const cfg = getAppConfig();
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
  const history = getSignalHistory(50);

  return NextResponse.json({
    success: true,
    config: {
      autoMonitorEnabled: cfg.autoMonitorEnabled,
      intervalMinutes: cfg.intervalMinutes,
      activeTimeframe: cfg.activeTimeframe,
      openaiModel,
      hasOpenaiKey: Boolean(openaiApiKey),
      hasGeminiKey: Boolean(geminiApiKey),
      hasTwelveDataKey: Boolean(twelveDataApiKey),
      useOllama,
      ollamaModel,
      ollamaBaseUrl,
      aiProvider,
    },
    history,
  });
}

export async function POST(req: NextRequest) {
  ensureBackgroundMonitorStarted();
  try {
    const body = await req.json();

    if (body.action === "clear_history") {
      clearSignalHistory();
      return NextResponse.json({
        success: true,
        history: [],
      });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.autoMonitorEnabled === "boolean") {
      updates.autoMonitorEnabled = body.autoMonitorEnabled;
    }
    if (typeof body.intervalMinutes === "number" && body.intervalMinutes >= 1) {
      updates.intervalMinutes = body.intervalMinutes;
    }
    if (
      typeof body.activeTimeframe === "string" &&
      ["M5", "M15", "H1", "H4"].includes(body.activeTimeframe)
    ) {
      updates.activeTimeframe = body.activeTimeframe as Timeframe;
    }
    if (typeof body.openaiApiKey === "string") {
      updates.openaiApiKey = body.openaiApiKey.trim();
    }
    if (typeof body.openaiModel === "string") {
      updates.openaiModel = body.openaiModel.trim();
    }
    if (typeof body.geminiApiKey === "string") {
      updates.geminiApiKey = body.geminiApiKey.trim();
    }
    if (typeof body.twelveDataApiKey === "string") {
      updates.twelveDataApiKey = body.twelveDataApiKey.trim();
    }
    if (typeof body.useOllama === "boolean") {
      updates.useOllama = body.useOllama;
    }
    if (typeof body.ollamaModel === "string") {
      updates.ollamaModel = body.ollamaModel.trim();
    }
    if (typeof body.ollamaBaseUrl === "string") {
      updates.ollamaBaseUrl = body.ollamaBaseUrl.trim();
    }
    if (typeof body.aiProvider === "string") {
      updates.aiProvider = body.aiProvider.trim();
    }

    const updated = saveAppConfig(updates);
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

    return NextResponse.json({
      success: true,
      config: {
        autoMonitorEnabled: updated.autoMonitorEnabled,
        intervalMinutes: updated.intervalMinutes,
        activeTimeframe: updated.activeTimeframe,
        openaiModel,
        hasOpenaiKey: Boolean(openaiApiKey),
        hasGeminiKey: Boolean(geminiApiKey),
        hasTwelveDataKey: Boolean(twelveDataApiKey),
        useOllama,
        ollamaModel,
        ollamaBaseUrl,
        aiProvider,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Gagal menyimpan konfigurasi",
      },
      { status: 500 }
    );
  }
}
