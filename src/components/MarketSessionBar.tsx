"use client";

import React, { useEffect, useState } from "react";
import { Clock, Flame, Globe2 } from "lucide-react";

interface SessionInfo {
  name: string;
  city: string;
  hoursWib: string;
  isOpen: boolean;
  volatility: "RENDAH" | "SEDANG" | "TINGGI" | "EKSTREM";
}

function isHourInRange(currentHourWib: number, start: number, end: number): boolean {
  if (start < end) {
    return currentHourWib >= start && currentHourWib < end;
  }
  // Melewati tengah malam (misal 19:00 - 04:00 WIB)
  return currentHourWib >= start || currentHourWib < end;
}

export default function MarketSessionBar() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return null;

  // Konversi waktu saat ini ke WIB (UTC+7)
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const wibHourFloat = (utcHours + 7 + utcMinutes / 60) % 24;

  const sessions: SessionInfo[] = [
    {
      name: "Sesi Sydney",
      city: "Sydney",
      hoursWib: "04:00 – 13:00 WIB",
      isOpen: isHourInRange(wibHourFloat, 4, 13),
      volatility: "RENDAH",
    },
    {
      name: "Sesi Asia",
      city: "Tokyo / Singapura",
      hoursWib: "06:00 – 15:00 WIB",
      isOpen: isHourInRange(wibHourFloat, 6, 15),
      volatility: "SEDANG",
    },
    {
      name: "Sesi Eropa",
      city: "London (LBMA)",
      hoursWib: "14:00 – 23:00 WIB",
      isOpen: isHourInRange(wibHourFloat, 14, 23),
      volatility: "TINGGI",
    },
    {
      name: "Sesi Amerika",
      city: "New York (COMEX)",
      hoursWib: "19:00 – 04:00 WIB",
      isOpen: isHourInRange(wibHourFloat, 19, 4),
      volatility: "EKSTREM",
    },
  ];

  // Overlap London & New York (19:00 - 23:00 WIB) adalah jam paling likuid & volatil untuk XAU/USD
  const isLondonNyOverlap = isHourInRange(wibHourFloat, 19, 23);

  const wibTimeStr = now.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const utcTimeStr = now.toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="bg-[#111621] border border-[#1E2738] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
      {/* Kiri: Jam Pasar Global Real-Time */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-slate-300 font-bold">
          <Globe2 className="w-4 h-4 text-sky-400" />
          <span>SESI PASAR EMAS GLOBAL:</span>
        </div>

        <div className="flex items-center gap-2 bg-[#090D14] px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-white font-bold">{wibTimeStr} WIB</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">{utcTimeStr} UTC</span>
        </div>

        {isLondonNyOverlap && (
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 animate-pulse">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            OVERLAP LONDON–NEW YORK (VOLATILITAS PUNCAK XAU/USD!)
          </span>
        )}
      </div>

      {/* Kanan: Indikator 4 Sesi Pasar */}
      <div className="flex flex-wrap items-center gap-2">
        {sessions.map((s) => (
          <div
            key={s.name}
            title={`${s.city} (${s.hoursWib}) • Volatilitas: ${s.volatility}`}
            className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-2 transition ${
              s.isOpen
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold"
                : "bg-[#090D14] border-slate-800/80 text-slate-500"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                s.isOpen ? "bg-emerald-400 animate-ping" : "bg-slate-700"
              }`}
            />
            <span>{s.name}</span>
            <span className="text-[10px] opacity-75">({s.hoursWib})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

