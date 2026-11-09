import fs from "fs";
import path from "path";
import { AISignalResult, Timeframe } from "./types";

export interface StoredAppConfig {
  autoMonitorEnabled: boolean;
  intervalMinutes: number;
  activeTimeframe: Timeframe;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  twelveDataApiKey?: string;
  useOllama?: boolean;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  aiProvider?: "auto" | "ollama" | "openai" | "gemini";
}

const DATA_DIR = path.join(process.cwd(), "data");
const SIGNALS_FILE = path.join(DATA_DIR, "signals-history.json");
const CONFIG_FILE = path.join(DATA_DIR, "app-config.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Ignore if read-only fs
  }
}

export function getAppConfig(): StoredAppConfig {
  ensureDataDir();
  const defaultConfig: StoredAppConfig = {
    autoMonitorEnabled: false, // Default false: analisa hanya berjalan saat diminta (on-demand) agar tidak memenuhi riwayat
    intervalMinutes: 5,
    activeTimeframe: "M15",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    geminiApiKey: "",
    twelveDataApiKey: "",
    useOllama: true, // Default aktif jika Ollama terdeteksi di laptop
    ollamaModel: "qwen2.5:3b",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    aiProvider: "auto",
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...defaultConfig, ...parsed };
    }
  } catch {
    // Return default
  }
  return defaultConfig;
}

export function saveAppConfig(partial: Partial<StoredAppConfig>): StoredAppConfig {
  ensureDataDir();
  const current = getAppConfig();
  const updated: StoredAppConfig = {
    ...current,
    ...partial,
  };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch {
    // Ignore write errors on read-only environments
  }
  return updated;
}

export function getEffectiveKeys(): {
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  twelveDataApiKey: string;
  useOllama: boolean;
  ollamaModel: string;
  ollamaBaseUrl: string;
  aiProvider: "auto" | "ollama" | "openai" | "gemini";
} {
  const cfg = getAppConfig();
  const openaiApiKey =
    (cfg.openaiApiKey && cfg.openaiApiKey.trim()) ||
    process.env.OPENAI_API_KEY ||
    "";
  const openaiModel =
    (cfg.openaiModel && cfg.openaiModel.trim()) || "gpt-4o-mini";
  const geminiApiKey =
    (cfg.geminiApiKey && cfg.geminiApiKey.trim()) ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";
  const twelveDataApiKey =
    (cfg.twelveDataApiKey && cfg.twelveDataApiKey.trim()) ||
    process.env.TWELVEDATA_API_KEY ||
    "";
  const useOllama = cfg.useOllama !== false;
  const ollamaModel = (cfg.ollamaModel && cfg.ollamaModel.trim()) || "qwen2.5:3b";
  const ollamaBaseUrl =
    (cfg.ollamaBaseUrl && cfg.ollamaBaseUrl.trim()) ||
    process.env.OLLAMA_BASE_URL ||
    "http://127.0.0.1:11434";
  const aiProvider = cfg.aiProvider || "auto";

  return {
    openaiApiKey,
    openaiModel,
    geminiApiKey,
    twelveDataApiKey,
    useOllama,
    ollamaModel,
    ollamaBaseUrl,
    aiProvider,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __globalSignalHistory: AISignalResult[] | undefined;
}

export function getSignalHistory(limit = 50): AISignalResult[] {
  if (globalThis.__globalSignalHistory && globalThis.__globalSignalHistory.length > 0) {
    return globalThis.__globalSignalHistory.slice(0, limit);
  }
  ensureDataDir();
  try {
    if (fs.existsSync(SIGNALS_FILE)) {
      const raw = fs.readFileSync(SIGNALS_FILE, "utf-8");
      const list: AISignalResult[] = JSON.parse(raw);
      if (Array.isArray(list)) {
        globalThis.__globalSignalHistory = list;
        return list.slice(0, limit);
      }
    }
  } catch {
    // Return empty array on parse error
  }
  return [];
}

export function getActiveSignal(timeframe?: Timeframe): AISignalResult | null {
  const list = getSignalHistory(50);
  if (timeframe) {
    return list.find((s) => s.timeframe === timeframe) || null;
  }
  return list[0] || null;
}

export function updateSignalInHistory(updatedSignal: AISignalResult): AISignalResult[] {
  ensureDataDir();
  const current = getSignalHistory(100);
  const idx = current.findIndex((s) => s.id === updatedSignal.id);
  if (idx !== -1) {
    current[idx] = updatedSignal;
    globalThis.__globalSignalHistory = current;
    try {
      fs.writeFileSync(SIGNALS_FILE, JSON.stringify(current, null, 2), "utf-8");
    } catch {
      // Ignore on read-only fs
    }
  }
  return current.slice(0, 50);
}

export function appendSignalToHistory(signal: AISignalResult): AISignalResult[] {
  ensureDataDir();
  const current = getSignalHistory(100);
  const updated = [signal, ...current].slice(0, 100);
  globalThis.__globalSignalHistory = updated;
  try {
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch {
    // Ignore write error on read-only fs
  }
  return updated.slice(0, 50);
}

export function clearSignalHistory(): void {
  ensureDataDir();
  globalThis.__globalSignalHistory = [];
  try {
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch {
    // Ignore on read-only fs
  }
}
