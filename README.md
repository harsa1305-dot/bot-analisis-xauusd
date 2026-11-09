# ⚡ XAU/USD Web AI Trading Terminal

Terminal trading berbasis AI dan Smart Money Concept (SMC / ICT) khusus instrumen **Gold (XAU/USD)**. Dilengkapi dengan deteksi Order Block (OB), Fair Value Gap (FVG), Liquidity Sweeps, dealing range Premium vs Discount, analisis kalender ekonomi (High-Impact News USD), serta integrasi AI hybrid (Ollama Local AI + Cloud AI).

---

## 🚀 Fitur Utama

- **Ultra-Live 0.5s Price Ticks**: Pembaruan harga spot emas dunia setiap 500ms dari RAM cache berkecepatan tinggi.
- **Analisis Multi-Timeframe Objektif**:
  - M5, M15, H1, dan H4 dianalisis 100% independen sesuai pergerakan candlestick masing-masing tanpa bias arah buatan.
  - Setiap timeframe selalu menyediakan **Setup Utama** dan **Skenario Alternatif (Dual-Direction)**.
- **SMC / ICT Institutional Structure**:
  - Deteksi Order Block fresh & Fair Value Gap (FVG).
  - Konfirmasi CHoCH (Change of Character) & BOS (Break of Structure).
  - Liquidity Sweeps (sapuan stop-loss retail di swing high/low).
  - Valuasi zona Discount (Buy) vs Premium (Sell).
- **Kalender Ekonomi & Deteksi News USD**:
  - Pelacak peristiwa High-Impact (CPI, NFP, FOMC, GDP, Retail Sales).
  - Filter fase news (*Pre-News*, *News Release*, *Post-News Settling*) untuk mencegah stop-hunt.
- **Hybrid AI Engine**:
  - 🦙 **Ollama Local AI**: Berjalan 100% lokal & gratis di laptop/komputer (`qwen2.5`, `llama3.2`, `deepseek-r1`).
  - ☁️ **Cloud AI (OpenAI & Gemini 2.5 Flash)**: Cadangan instan berbasis cloud.
  - 🧮 **SMC Quant Engine**: Fallback matematika deterministik jika AI offline.
- **Trade Lifecycle Locking**:
  - Menjaga fokus trader dengan mengunci setup limit aktif hingga menyentuh Take Profit (TP) atau Stop Loss (SL) sebelum menganalisis setup baru.
  - Notifikasi suara real-time (*Web Audio API*) saat order terjemput, hit TP, atau hit SL.
- **Interactive AI Chat Drawer**:
  - Tanya jawab langsung dengan AI analis mengenai validasi setup, skenario news, dan manajemen risiko.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 15 (App Router)](https://nextjs.org/)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charting**: TradingView Lightweight Charts
- **Local AI**: [Ollama](https://ollama.com/)
- **Cloud AI**: OpenAI API / Google Gemini API

---

## ⚙️ Variabel Lingkungan (.env)

Buat file `.env.local` atau atur Environment Variables di Vercel:

```env
# Cloud AI (Opsional jika memakai Ollama lokal)
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=AIzaSy...

# Data Feed (Opsional - default menggunakan live spot feed)
TWELVEDATA_API_KEY=...

# Ollama Base URL (Default di lokal)
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

---

## 📦 Menjalankan Secara Lokal

```bash
# 1. Install dependencies
npm install

# 2. Jalankan development server
npm run dev

# 3. Buka browser
http://localhost:3000
```

---

## ☁️ Deployment ke Vercel

Proyek ini telah dioptimalkan untuk deployment ke Vercel:
1. Hubungkan repository GitHub ini di dashboard [Vercel](https://vercel.com).
2. Tambahkan Environment Variables yang diinginkan (`OPENAI_API_KEY` atau `GEMINI_API_KEY`).
3. Klik **Deploy**!
