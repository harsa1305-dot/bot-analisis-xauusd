import { NextRequest, NextResponse } from "next/server";
import {
  checkOllamaStatus,
  getOllamaModels,
  pullOllamaModel,
} from "@/lib/ollamaClient";
import { getAppConfig, getEffectiveKeys, saveAppConfig } from "@/lib/signalStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/ollama
 * Cek status daemon Ollama di laptop & daftar model yang terpasang
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queryUrl = searchParams.get("baseUrl")?.trim();
  const effective = getEffectiveKeys();
  const baseUrl = queryUrl || effective.ollamaBaseUrl || "http://127.0.0.1:11434";
  const status = await checkOllamaStatus(baseUrl);
  const models = await getOllamaModels(baseUrl);

  return NextResponse.json({
    success: true,
    online: status.online,
    baseUrl: status.baseUrl,
    error: status.error,
    models: models.map((m) => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
    })),
    activeModel: effective.ollamaModel || (models[0]?.name ?? "qwen2.5:1.5b"),
    useOllama: effective.useOllama !== false,
  });
}

/**
 * POST /api/ollama
 * Perintah pull model, pilih model aktif, atau uji koneksi
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, model, baseUrl, useOllama } = body;
    const cfg = getAppConfig();
    const targetUrl = baseUrl || cfg.ollamaBaseUrl || "http://127.0.0.1:11434";

    if (action === "pull") {
      if (!model || typeof model !== "string") {
        return NextResponse.json(
          { success: false, error: "Nama model wajib diisi untuk diunduh." },
          { status: 400 }
        );
      }

      const pullRes = await pullOllamaModel(model.trim(), targetUrl);
      if (pullRes.success) {
        saveAppConfig({ ollamaModel: model.trim(), useOllama: true });
      }
      return NextResponse.json(pullRes);
    }

    if (action === "set_config") {
      const updates: Record<string, unknown> = {};
      if (typeof model === "string" && model.trim()) updates.ollamaModel = model.trim();
      if (typeof baseUrl === "string" && baseUrl.trim()) updates.ollamaBaseUrl = baseUrl.trim();
      if (typeof useOllama === "boolean") updates.useOllama = useOllama;

      saveAppConfig(updates);
      return NextResponse.json({ success: true, message: "Konfigurasi Ollama disimpan." });
    }

    // Default test status
    const status = await checkOllamaStatus(targetUrl);
    return NextResponse.json({ success: true, status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan pada Ollama API";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

