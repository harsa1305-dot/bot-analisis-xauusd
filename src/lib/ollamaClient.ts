import {
  AISignalResult,
  LimitCandidate,
  NewsContext,
  PreProcessedMarketData,
  SignalDecision,
} from "./types";

export interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
  parameter_size?: string;
  family?: string;
}

export interface OllamaStatus {
  online: boolean;
  baseUrl: string;
  version?: string;
  models: string[];
  error?: string;
}

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

/**
 * Cek status koneksi ke daemon Ollama di laptop lokal
 */
export async function checkOllamaStatus(
  baseUrl = DEFAULT_OLLAMA_URL
): Promise<OllamaStatus> {
  const url = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return {
        online: false,
        baseUrl: url,
        models: [],
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    const models: string[] = Array.isArray(data?.models)
      ? data.models.map((m: { name: string }) => m.name)
      : [];

    return {
      online: true,
      baseUrl: url,
      models,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      online: false,
      baseUrl: url,
      models: [],
      error: `Gagal terhubung ke Ollama (${msg}). Pastikan Ollama aktif di laptop.`,
    };
  }
}

/**
 * Tarik daftar lengkap model yang sudah di-download di Ollama
 */
export async function getOllamaModels(
  baseUrl = DEFAULT_OLLAMA_URL
): Promise<OllamaModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.models) ? data.models : [];
  } catch {
    return [];
  }
}

/**
 * Perintah pull model secara lokal via Ollama REST API
 */
export async function pullOllamaModel(
  modelName: string,
  baseUrl = DEFAULT_OLLAMA_URL
): Promise<{ success: boolean; message: string }> {
  const url = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${url}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: false }),
      // Pulling model could take a while depending on internet connection
      signal: AbortSignal.timeout(600000), // 10 menit
    });

    if (!res.ok) {
      const err = await res.text();
      return {
        success: false,
        message: `Gagal mengunduh model: ${err || res.statusText}`,
      };
    }

    return {
      success: true,
      message: `Model ${modelName} berhasil diunduh dan siap digunakan di laptop!`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message:
        err instanceof Error
          ? err.message
          : "Gagal mengunduh model via Ollama",
    };
  }
}

/**
 * Jalankan inferensi analisis pasar XAU/USD menggunakan Ollama Local
 */
export async function generateWithOllama(params: {
  systemPrompt: string;
  payload: Record<string, unknown>;
  modelName: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<Record<string, unknown> | null> {
  const {
    systemPrompt,
    payload,
    modelName,
    baseUrl = DEFAULT_OLLAMA_URL,
    timeoutMs = 45000,
  } = params;

  const url = baseUrl.replace(/\/+$/, "");

  try {
    const userPrompt = `Analisa paket data XAU/USD berikut. Pilih kandidat limit order terbaik (via "id") atau WAIT. Untuk WAIT isi candidateId dengan "NONE". Kembalikan jawaban HANYA berupa JSON valid dengan schema:\n{\n  "decision": "TAKE_CANDIDATE" | "WAIT",\n  "candidateId": string,\n  "confidence": number,\n  "marketBias": string,\n  "reasoning": string,\n  "keyFactors": string[],\n  "newsOutlook": string\n}\n\nDATA:\n${JSON.stringify(
      payload,
      null,
      2
    )}`;

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        format: "json",
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[Ollama Inference Warning] HTTP ${res.status}:`, err);
      return null;
    }

    const data = await res.json();
    const content = data?.message?.content;
    if (!content || typeof content !== "string") {
      return null;
    }

    // Bersihkan markdown code fence jika model menyertakannya
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("[Ollama Inference Failed]:", err);
    return null;
  }
}

