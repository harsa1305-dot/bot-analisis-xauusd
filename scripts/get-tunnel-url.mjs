import { spawn } from "child_process";
import fs from "fs";

const CLOUDFLARED_PATH = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe";

console.log("Menghubungkan Ollama ke Cloudflare Tunnel...");

const proc = spawn(CLOUDFLARED_PATH, ["tunnel", "--url", "http://127.0.0.1:11434"], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

let found = false;

proc.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (match && !found) {
    found = true;
    const url = match[0];
    console.log("TUNNEL_URL_FOUND=" + url);
    fs.writeFileSync("data/active-tunnel.json", JSON.stringify({ url, time: Date.now() }, null, 2));
  }
});

setTimeout(() => {
  if (!found) {
    console.error("Timeout menunggu URL tunnel.");
    proc.kill();
    process.exit(1);
  }
}, 25000);

