"use client";

import React from "react";
import { AISignalResult } from "@/lib/types";
import {
  Clock,
  History,
  Radio,
  Trash2,
  Zap,
} from "lucide-react";

interface SignalHistoryTableProps {
  history: AISignalResult[];
  selectedSignalId?: string;
  onSelectSignal: (signal: AISignalResult) => void;
  onClearHistory: () => void;
}

export default function SignalHistoryTable({
  history,
  selectedSignalId,
  onSelectSignal,
  onClearHistory,
}: SignalHistoryTableProps) {
  return (
    <div className="bg-[#111621] border border-[#1E2738] rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#1E2738] bg-[#0D121B] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-amber-400" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
            Log Riwayat Sinyal Pemantauan 24 Jam ({history.length} Sinyal Tersimpan)
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" />
            Persisted Feed
          </span>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Bersihkan Riwayat
          </button>
        )}
      </div>

      {/* Table */}
      {history.length === 0 ? (
        <div className="p-8 text-center font-mono text-sm text-slate-500">
          Belum ada riwayat sinyal tersimpan. Klik &quot;Analisa Ulang&quot; atau nyalakan
          Saklar Auto-Monitor 24 Jam.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="bg-[#090D14] text-slate-400 uppercase text-[11px] sticky top-0 z-10 border-b border-[#1E2738]">
              <tr>
                <th className="py-3 px-4">Waktu (WIB)</th>
                <th className="py-3 px-3">Trigger</th>
                <th className="py-3 px-3">TF</th>
                <th className="py-3 px-3">Order Limit</th>
                <th className="py-3 px-3">Status / Hasil</th>
                <th className="py-3 px-3">Setup Momen</th>
                <th className="py-3 px-3">Confidence</th>
                <th className="py-3 px-3">Harga Limit</th>
                <th className="py-3 px-3">Stop Loss</th>
                <th className="py-3 px-3">TP 1</th>
                <th className="py-3 px-3">TP 2</th>
                <th className="py-3 px-3">R:R</th>
                <th className="py-3 px-4">Rasionalisasi Singkat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182030]">
              {history.map((item) => {
                const isSelected = item.id === selectedSignalId;
                const isBuy = item.signal === "BUY";
                const isSell = item.signal === "SELL";

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectSignal(item)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? "bg-amber-500/10 hover:bg-amber-500/15"
                        : "hover:bg-slate-800/40"
                    }`}
                  >
                    <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          {new Date(item.timestamp).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] border ${
                          item.triggerType === "AUTO_24H"
                            ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {item.triggerType === "AUTO_24H" ? (
                          <span className="inline-flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" /> AUTO 24H
                          </span>
                        ) : (
                          "MANUAL"
                        )}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-bold text-amber-400">
                      {item.timeframe}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded font-bold text-xs border ${
                          isBuy
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                            : isSell
                            ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
                            : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                        }`}
                      >
                        {item.orderType === "BUY_LIMIT" || isBuy
                          ? "BUY LIMIT"
                          : item.orderType === "SELL_LIMIT" || isSell
                          ? "SELL LIMIT"
                          : "WAIT"}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {item.tradeStatus === "CLOSED_TP2" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          🏆 TP2 HIT (+{item.realizedPips ?? item.tp2Pips} p)
                        </span>
                      ) : item.tradeStatus === "CLOSED_TP1" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          🎯 TP1 HIT (+{item.realizedPips ?? item.tp1Pips} p)
                        </span>
                      ) : item.tradeStatus === "CLOSED_SL" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          🛡️ SL HIT ({item.realizedPips ?? (item.slPips ? -item.slPips : 0)} p)
                        </span>
                      ) : item.tradeStatus === "FILLED_IN_POSITION" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                          🟢 RUNNING
                        </span>
                      ) : item.tradeStatus === "WAITING_FILL" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                          ⏳ PENDING
                        </span>
                      ) : item.tradeStatus === "CANCELLED_INVALIDATED" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] text-slate-400 bg-slate-800 border border-slate-700">
                          🚫 BATAL
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] text-slate-400 bg-slate-800/60 border border-slate-700/60">
                          ⏸️ STANDBY
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap max-w-[160px] truncate">
                      {item.setupType || item.marketBias || "-"}
                    </td>

                    <td className="py-3 px-3 text-white font-semibold">
                      {item.confidence}%
                    </td>

                    <td className="py-3 px-3 text-sky-300 font-semibold">
                      ${item.entryPrice.toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-rose-400 font-semibold">
                      ${item.stopLoss.toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-emerald-400 font-semibold">
                      ${item.tp1.toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-emerald-300 font-semibold">
                      ${item.tp2.toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-slate-300">
                      {item.riskRewardRatio}
                    </td>

                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                      {item.reasoning}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

