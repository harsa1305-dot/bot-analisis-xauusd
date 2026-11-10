@echo off
title Ollama to Vercel Bridge (Cloudflare Tunnel)
color 0A

echo ================================================================
echo    XAU/USD AI TERMINAL - OLLAMA CLOUD BRIDGE
echo ================================================================
echo.
echo 1. Memeriksa status Ollama di laptop...
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Ollama belum menyala. Memulai Ollama...
    start "" "C:\Users\hp\AppData\Local\Programs\Ollama\ollama.exe"
    timeout /t 3 /nobreak >nul
)

echo [OK] Ollama aktif di http://127.0.0.1:11434
echo.
echo 2. Membuka Cloudflare Secure Tunnel ke Vercel Cloud...
echo.
echo ----------------------------------------------------------------
echo Salin URL https://....trycloudflare.com yang muncul di bawah ini,
echo lalu paste ke menu Pengaturan (ikon Gear) di Vercel:
echo https://bot-analisis-xauusd.vercel.app
echo ----------------------------------------------------------------
echo.

"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:11434

pause

