"use client";

import React, { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Cpu,
  DownloadCloud,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasOpenaiKey: boolean;
  openaiModel: string;
  hasGeminiKey: boolean;
  hasTwelveDataKey: boolean;
  intervalMinutes: number;
  initialUseOllama?: boolean;
  initialOllamaModel?: string;
  initialOllamaBaseUrl?: string;
  initialAiProvider?: string;
  onSaveConfig: (payload: {
    openaiApiKey?: string;
    openaiModel?: string;
    geminiApiKey?: string;
    twelveDataApiKey?: string;
    intervalMinutes: number;
    useOllama?: boolean;
    ollamaModel?: string;
    ollamaBaseUrl?: string;
    aiProvider?: "auto" | "ollama" | "openai" | "gemini";
  }) => Promise<void>;
}

export default function ApiKeyModal({
  isOpen,
  onClose,
  hasOpenaiKey,
  openaiModel,
  hasGeminiKey,
  hasTwelveDataKey,
  intervalMinutes,
  initialUseOllama = true,
  initialOllamaModel = "qwen2.5:3b",
  initialOllamaBaseUrl = "http://127.0.0.1:11434",
  initialAiProvider = "auto",
  onSaveConfig,
}: ApiKeyModalProps) {
  const [activeTab, setActiveTab] = useState<"OLLAMA" | "CLOUD_AI" | "DATA_FEED">("OLLAMA");

  // OpenAI & Gemini State
  const [openaiKey, setOpenaiKey] = useState("");
  const [model, setModel] = useState(openaiModel || "gpt-4o-mini");
  const [geminiKey, setGeminiKey] = useState("");
  const [twelveDataKey, setTwelveDataKey] = useState("");
  const [interval, setIntervalVal] = useState(intervalMinutes || 5);
  const [saving, setSaving] = useState(false);

  // Ollama Local State
  const [useOllama, setUseOllama] = useState(initialUseOllama);
  const [ollamaModel, setOllamaModel] = useState(initialOllamaModel);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(initialOllamaBaseUrl);
  const [aiProvider, setAiProvider] = useState<"auto" | "ollama" | "openai" | "gemini">(
    (initialAiProvider as "auto" | "ollama" | "openai" | "gemini") || "auto"
  );

  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [installedModels, setInstalledModels] = useState<{ name: string; size: number }[]>([]);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullStatusMsg, setPullStatusMsg] = useState<string | null>(null);

  // Cek status Ollama saat modal terbuka
  const refreshOllama = async () => {
    setCheckingOllama(true);
    setPullStatusMsg(null);
    try {
      const res = await fetch("/api/ollama", { cache: "no-store" });
      const data = await res.json();
      if (data && data.success) {
        setOllamaOnline(Boolean(data.online));
        setInstalledModels(Array.isArray(data.models) ? data.models : []);
        if (data.activeModel && !ollamaModel) {
          setOllamaModel(data.activeModel);
        }
      } else {
        setOllamaOnline(false);
      }
    } catch {
      setOllamaOnline(false);
    } finally {
      setCheckingOllama(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshOllama();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle pull model 1-click
  const handlePullModel = async (targetModel: string) => {
    setPullingModel(targetModel);
    setPullStatusMsg(`Mengunduh ${targetModel} langsung ke Ollama laptop Anda... Proses ini berlangsung di background.`);
    try {
      const res = await fetch("/api/ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", model: targetModel }),
      });
      const data = await res.json();
      if (data?.success) {
        setPullStatusMsg(`✅ Sukses: Model ${targetModel} berhasil diunduh dan dipasang di laptop!`);
        setOllamaModel(targetModel);
        setUseOllama(true);
        await refreshOllama();
      } else {
        setPullStatusMsg(`❌ Gagal: ${data?.message || data?.error || "Gagal mengunduh model"}`);
      }
    } catch (err: unknown) {
      setPullStatusMsg(`❌ Error: ${err instanceof Error ? err.message : "Gagal mengunduh"}`);
    } finally {
      setPullingModel(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: {
        openaiApiKey?: string;
        openaiModel?: string;
        geminiApiKey?: string;
        twelveDataApiKey?: string;
        intervalMinutes: number;
        useOllama: boolean;
        ollamaModel: string;
        ollamaBaseUrl: string;
        aiProvider: "auto" | "ollama" | "openai" | "gemini";
      } = {
        intervalMinutes: interval,
        openaiModel: model,
        useOllama,
        ollamaModel,
        ollamaBaseUrl,
        aiProvider,
      };

      if (openaiKey.trim() !== "") payload.openaiApiKey = openaiKey.trim();
      if (geminiKey.trim() !== "") payload.geminiApiKey = geminiKey.trim();
      if (twelveDataKey.trim() !== "") payload.twelveDataApiKey = twelveDataKey.trim();

      await onSaveConfig(payload);
      setOpenaiKey("");
      setGeminiKey("");
      setTwelveDataKey("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111621] border border-[#1E2738] rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl max-h-[92vh] flex flex-col font-mono text-xs">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1E2738] bg-[#0D121B] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                Konfigurasi AI Engine & Data Feed
              </h3>
              <p className="text-[10px] text-slate-400">
                Pilih antara Ollama Lokal (Laptop Offline) atau Cloud AI (OpenAI / Gemini)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-[#1E2738] bg-[#090D14] px-4 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("OLLAMA")}
            className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition ${
              activeTab === "OLLAMA"
                ? "border-emerald-400 text-emerald-300 bg-emerald-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>🦙 Ollama Local AI</span>
            {ollamaOnline && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("CLOUD_AI")}
            className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition ${
              activeTab === "CLOUD_AI"
                ? "border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Cloud API (OpenAI / Gemini)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("DATA_FEED")}
            className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition ${
              activeTab === "DATA_FEED"
                ? "border-sky-400 text-sky-300 bg-sky-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Data Feed (Twelve Data)</span>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* TAB 1: OLLAMA LOCAL AI */}
          {activeTab === "OLLAMA" && (
            <div className="space-y-4">
              {/* Status Bar Ollama */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                  ollamaOnline
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  {checkingOllama ? (
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                  ) : ollamaOnline ? (
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Wifi className="w-4 h-4 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
                      <WifiOff className="w-4 h-4 text-rose-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      <span>
                        {ollamaOnline
                          ? "Ollama Terdeteksi di Laptop (ONLINE)"
                          : "Ollama Tidak Terdeteksi / Offline"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {ollamaOnline
                        ? `Host: ${ollamaBaseUrl} • ${installedModels.length} Model Terpasang`
                        : "Pastikan aplikasi Ollama sudah dijalankan di background Windows laptop Anda."}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={refreshOllama}
                  disabled={checkingOllama}
                  title="Cek Ulang Koneksi Ollama"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingOllama ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Saklar Gunakan Ollama */}
              <div className="p-3.5 rounded-xl bg-[#090D14] border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Aktifkan Ollama Local AI</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    100% Gratis, tanpa kuota API, dan berjalan langsung memakai hardware laptop Anda.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useOllama}
                    onChange={(e) => setUseOllama(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>

              {/* Mode Prioritas AI Provider */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Prioritas Eksekusi AI
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as "auto" | "ollama" | "openai" | "gemini")}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090D14] border border-slate-700 text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value="auto">
                    🤖 AUTO (Utamakan Ollama Local → OpenAI → Gemini → SMC Quant Fallback)
                  </option>
                  <option value="ollama">
                    🦙 HANYA OLLAMA (100% Offline Lokal di Laptop)
                  </option>
                  <option value="openai">
                    ☁️ HANYA OPENAI GPT (Cloud API)
                  </option>
                  <option value="gemini">
                    ✨ HANYA GOOGLE GEMINI (Cloud API)
                  </option>
                </select>
              </div>

              {/* Pilihan Model Ollama Terpasang */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold flex items-center justify-between">
                  <span>Pilih Model Ollama Aktif</span>
                  <span className="text-[10px] text-slate-400">
                    {installedModels.length} terpasang
                  </span>
                </label>

                {installedModels.length > 0 ? (
                  <select
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#090D14] border border-slate-700 text-white focus:outline-none focus:border-emerald-400"
                  >
                    {installedModels.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({(m.size / (1024 * 1024 * 1024)).toFixed(2)} GB)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
                    Belum ada model yang di-download di Ollama laptop Anda. Klik tombol 1-Click Install di bawah untuk memasang model trading yang direkomendasikan!
                  </div>
                )}
              </div>

              {/* Rekomendasi Model 1-Click Install */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <DownloadCloud className="w-3.5 h-3.5 text-sky-400" />
                  <span>Rekomendasi Model Trading untuk Laptop (8 GB RAM):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Model 1: Qwen 2.5 3B */}
                  <div className="p-3 rounded-xl bg-[#090D14] border border-slate-800 hover:border-emerald-500/50 transition flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>qwen2.5:3b</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                          BEST
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Sangat presisi untuk data teknikal SMC & output JSON terstruktur.
                      </p>
                      <div className="text-[10px] text-slate-500 mt-1">Ukuran: ~1.9 GB</div>
                    </div>
                    <button
                      type="button"
                      disabled={pullingModel !== null}
                      onClick={() => handlePullModel("qwen2.5:3b")}
                      className="mt-2.5 w-full py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {pullingModel === "qwen2.5:3b" ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Unduh...</span>
                        </>
                      ) : installedModels.some((m) => m.name.includes("qwen2.5:3b")) ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Terpasang</span>
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="w-3 h-3" />
                          <span>Pasang</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Model 2: Llama 3.2 3B */}
                  <div className="p-3 rounded-xl bg-[#090D14] border border-slate-800 hover:border-sky-500/50 transition flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>llama3.2:3b</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">
                          FAST
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Meta LLaMA 3.2 ringan, cepat, dan penalaran pasar yang tajam.
                      </p>
                      <div className="text-[10px] text-slate-500 mt-1">Ukuran: ~2.0 GB</div>
                    </div>
                    <button
                      type="button"
                      disabled={pullingModel !== null}
                      onClick={() => handlePullModel("llama3.2:3b")}
                      className="mt-2.5 w-full py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {pullingModel === "llama3.2:3b" ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Unduh...</span>
                        </>
                      ) : installedModels.some((m) => m.name.includes("llama3.2:3b")) ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-sky-400" />
                          <span>Terpasang</span>
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="w-3 h-3" />
                          <span>Pasang</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Model 3: DeepSeek R1 1.5B */}
                  <div className="p-3 rounded-xl bg-[#090D14] border border-slate-800 hover:border-purple-500/50 transition flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>deepseek-r1:1.5b</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">
                          LIGHT
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        DeepSeek Reasoning ultra-ringan & respon kilat di RAM terbatas.
                      </p>
                      <div className="text-[10px] text-slate-500 mt-1">Ukuran: ~1.1 GB</div>
                    </div>
                    <button
                      type="button"
                      disabled={pullingModel !== null}
                      onClick={() => handlePullModel("deepseek-r1:1.5b")}
                      className="mt-2.5 w-full py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {pullingModel === "deepseek-r1:1.5b" ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Unduh...</span>
                        </>
                      ) : installedModels.some((m) => m.name.includes("deepseek-r1:1.5b")) ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-purple-400" />
                          <span>Terpasang</span>
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="w-3 h-3" />
                          <span>Pasang</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {pullStatusMsg && (
                  <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-200 text-[11px] animate-pulse">
                    {pullStatusMsg}
                  </div>
                )}
              </div>

              {/* Custom Ollama Base URL */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-slate-400 text-[11px]">
                  Ollama Base URL (Default: http://127.0.0.1:11434)
                </label>
                <input
                  type="text"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://127.0.0.1:11434"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#090D14] border border-slate-800 text-slate-300 focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>
          )}

          {/* TAB 2: CLOUD AI (OPENAI / GEMINI) */}
          {activeTab === "CLOUD_AI" && (
            <div className="space-y-4">
              {/* Pilih Model OpenAI */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Model OpenAI GPT
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090D14] border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="gpt-4o-mini">
                    gpt-4o-mini (Cepat, Akurat & Hemat Kuota 24 Jam - Recommended)
                  </option>
                  <option value="gpt-4o">
                    gpt-4o (Deep Institutional Reasoning)
                  </option>
                </select>
              </div>

              {/* Input OpenAI API Key */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  1. OpenAI API Key (sk-proj-...)
                </label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder={
                    hasOpenaiKey
                      ? "✅ API Key OpenAI tersimpan (isi jika ingin mengganti)"
                      : "Masukkan sk-proj-... dari platform.openai.com"
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090D14] border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Input Gemini API Key */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  2. Google Gemini API Key (Gratis Tanpa Saldo - Cadangan Otomatis)
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={
                    hasGeminiKey
                      ? "✅ API Key Gemini tersimpan (isi jika ingin mengganti)"
                      : "Masukkan AIzaSy... dari aistudio.google.com (Opsional)"
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090D14] border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                />
                <p className="text-[11px] text-slate-400">
                  Jika kuota OpenAI habis dan Ollama offline, sistem otomatis memakai{" "}
                  <strong>Gemini 2.5 Flash</strong> sebelum beralih ke SMC Quant Engine.
                </p>
              </div>

              {/* Interval Waktu */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Interval Pemantauan Siklus (Menit)
                </label>
                <select
                  value={interval}
                  onChange={(e) => setIntervalVal(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090D14] border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value={1}>Setiap 1 Menit</option>
                  <option value={5}>Setiap 5 Menit (Rekomendasi Default)</option>
                  <option value={15}>Setiap 15 Menit (Penutupan Candle M15)</option>
                  <option value={30}>Setiap 30 Menit</option>
                  <option value={60}>Setiap 60 Menit</option>
                </select>
              </div>
            </div>
          )}

          {/* TAB 3: DATA FEED */}
          {activeTab === "DATA_FEED" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Twelve Data API Key (twelvedata.com)
                </label>
                <input
                  type="password"
                  value={twelveDataKey}
                  onChange={(e) => setTwelveDataKey(e.target.value)}
                  placeholder={
                    hasTwelveDataKey
                      ? "✅ Sudah tersimpan (isi jika ingin mengganti key baru)"
                      : "Masukkan API Key dari twelvedata.com (opsional)"
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090D14] border border-slate-700 text-white focus:outline-none focus:border-sky-400"
                />
                <p className="text-[11px] text-slate-400">
                  Digunakan untuk menarik data candlestick time_series XAU/USD langsung dari feed institusional broker OANDA.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300">
                <div className="font-bold flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Ultra-Live Tick 0.5s Aktif</span>
                </div>
                <p className="text-[10px] text-slate-300 mt-1">
                  Terminal ini sudah terhubung dengan mesin RAM cache 500ms zero-delay untuk mengalirkan spot gold price tanpa jeda.
                </p>
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-[11px] text-emerald-300">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Privasi & Keamanan: Model Ollama berjalan 100% lokal di CPU/GPU laptop Anda. Tidak ada data yang dikirim ke server luar saat menggunakan Ollama.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1E2738]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
