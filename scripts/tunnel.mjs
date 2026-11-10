import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const CLOUDFLARED_PATH = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe";
const LOCAL_OLLAMA_URL = "http://127.0.0.1:11434";

console.log("==================================================");
console.log("🚀 MEMBUAT CLOUDFLARE TUNNEL UNTUK OLLAMA LAPTOP");
console.log("==================================================");

if (!fs.existsSync(CLOUDFLARED_PATH)) {
  console.error("❌ cloudflared.exe tidak ditemukan di:", CLOUDFLARED_PATH);
  process.exit(1);
}

const tunnel = spawn(CLOUDFLARED_PATH, ["tunnel", "--url", LOCAL_OLLAMA_URL], {
  windowsHide: false,
});

let tunnelUrl = null;

tunnel.stderr.on("data", async (data) => {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    console.log("\n==================================================");
    console.log("🎉 CLOUDFLARE TUNNEL BERHASIL AKTIF!");
    console.log("🌐 URL Publik Ollama Laptop Anda:");
    console.log(`   👉 ${tunnelUrl}`);
    console.log("==================================================\n");

    console.log("Menguji koneksi tunnel ke Ollama...");
    try {
      const res = await fetch(`${tunnelUrl}/api/tags`, { signal: AbortSignal.timeout(6000) });
      const json = await res.json();
      console.log("✅ Berhasil terhubung via internet!");
      console.log("📦 Model aktif di laptop:", json.models?.map((m) => m.name).join(", "));
      console.log("\nSimpan URL ini ke Vercel Environment Variable OLLAMA_BASE_URL.");
    } catch (err) {
      console.warn("Koneksi tunnel masih proses handshake:", err.message);
    }
  }
});

tunnel.stdout.on("data", (data) => {
  // console.log(data.toString());
});

tunnel.on("close", (code) => {
  console.log(`Tunnel ditutup dengan kode: ${code}`);
});

process.on("SIGINT", () => {
  tunnel.kill();
  process.exit(0);
});
