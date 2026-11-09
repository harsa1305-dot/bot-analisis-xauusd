import { AISignalResult, AnalystAlert, TradeStatus } from "./types";

export interface LifecycleEvaluationResult {
  updatedSignal: AISignalResult;
  statusChanged: boolean;
  alert: AnalystAlert | null;
  isTradeResolved: boolean; // true jika baru saja CLOSED_TP2, CLOSED_SL, atau CANCELLED
}

/**
 * Mengevaluasi siklus hidup posisi limit order terhadap harga spot real-time saat ini.
 * Memastikan sinyal TIDAK diganti sembarangan sebelum posisinya selesai (TP / SL / Batal).
 */
export function evaluateTradeLifecycle(
  signal: AISignalResult,
  spotPrice: number
): LifecycleEvaluationResult {
  // Jika sinyal WAIT, statusnya adalah STANDBY_WAIT (tidak ada posisi yang perlu dikunci)
  if (signal.signal === "WAIT" || signal.orderType === "NONE") {
    return {
      updatedSignal: {
        ...signal,
        tradeStatus: "STANDBY_WAIT",
      },
      statusChanged: signal.tradeStatus !== "STANDBY_WAIT",
      alert: null,
      isTradeResolved: false,
    };
  }

  // Jika trade sudah selesai sebelumnya, pertahankan status penutupannya
  if (
    signal.tradeStatus === "CLOSED_TP2" ||
    signal.tradeStatus === "CLOSED_SL" ||
    signal.tradeStatus === "CANCELLED_INVALIDATED"
  ) {
    return {
      updatedSignal: signal,
      statusChanged: false,
      alert: null,
      isTradeResolved: false,
    };
  }

  const currentStatus: TradeStatus = signal.tradeStatus || "WAITING_FILL";
  const isBuy = signal.signal === "BUY" || signal.orderType === "BUY_LIMIT";
  const now = Date.now();

  const zoneLow = signal.entryZoneLow ?? signal.entryPrice;
  const zoneHigh = signal.entryZoneHigh ?? signal.entryPrice;

  // 1. Status: MENUNGGU JEMPUTAN (WAITING_FILL)
  if (currentStatus === "WAITING_FILL") {
    if (isBuy) {
      // Cek pembatalan (harga lari naik ke cancelLevel sebelum terjemput)
      if (signal.cancelLevel && spotPrice >= signal.cancelLevel) {
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "CANCELLED_INVALIDATED",
          closedAtPrice: spotPrice,
          closedAtTime: new Date(now).toISOString(),
          closedReason: `Harga menembus Cancel Level $${signal.cancelLevel.toFixed(
            2
          )} sebelum limit terisi`,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-cancel-${now}`,
            type: "ORDER_CANCELLED",
            title: "🚫 Buy Limit Batal (Target Lari)",
            message: `Harga menyentuh $${spotPrice.toFixed(
              2
            )} (di atas Cancel Level $${signal.cancelLevel.toFixed(
              2
            )}). Setup dibatalkan. AI bersiap menganalisis momen baru.`,
            timestamp: now,
          },
          isTradeResolved: true,
        };
      }

      // Cek apakah harga pullback menyentuh zona limit (terisi)
      if (spotPrice <= zoneHigh) {
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "FILLED_IN_POSITION",
          filledAtPrice: spotPrice,
          filledAtTime: new Date(now).toISOString(),
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-fill-${now}`,
            type: "ORDER_FILLED",
            title: "🎯 BUY LIMIT TERISI (ORDER FILLED)!",
            message: `Harga spot menyentuh $${spotPrice.toFixed(
              2
            )} (zona $${zoneLow.toFixed(2)}–$${zoneHigh.toFixed(
              2
            )}). Posisi BUY sekarang aktif berjalan menuju TP1/TP2.`,
            timestamp: now,
          },
          isTradeResolved: false,
        };
      }
    } else {
      // SELL_LIMIT
      // Cek pembatalan (harga lari turun ke cancelLevel sebelum terjemput)
      if (signal.cancelLevel && spotPrice <= signal.cancelLevel) {
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "CANCELLED_INVALIDATED",
          closedAtPrice: spotPrice,
          closedAtTime: new Date(now).toISOString(),
          closedReason: `Harga menembus Cancel Level $${signal.cancelLevel.toFixed(
            2
          )} sebelum limit terisi`,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-cancel-${now}`,
            type: "ORDER_CANCELLED",
            title: "🚫 Sell Limit Batal (Target Lari)",
            message: `Harga menyentuh $${spotPrice.toFixed(
              2
            )} (di bawah Cancel Level $${signal.cancelLevel.toFixed(
              2
            )}). Setup dibatalkan. AI bersiap menganalisis momen baru.`,
            timestamp: now,
          },
          isTradeResolved: true,
        };
      }

      // Cek apakah harga rally menyentuh zona limit (terisi)
      if (spotPrice >= zoneLow) {
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "FILLED_IN_POSITION",
          filledAtPrice: spotPrice,
          filledAtTime: new Date(now).toISOString(),
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-fill-${now}`,
            type: "ORDER_FILLED",
            title: "🎯 SELL LIMIT TERISI (ORDER FILLED)!",
            message: `Harga spot menyentuh $${spotPrice.toFixed(
              2
            )} (zona $${zoneLow.toFixed(2)}–$${zoneHigh.toFixed(
              2
            )}). Posisi SELL sekarang aktif berjalan menuju TP1/TP2.`,
            timestamp: now,
          },
          isTradeResolved: false,
        };
      }
    }

    // Masih menunggu jemputan
    return {
      updatedSignal: { ...signal, tradeStatus: "WAITING_FILL" },
      statusChanged: false,
      alert: null,
      isTradeResolved: false,
    };
  }

  // 2. Status: POSISI SEDANG BERJALAN (FILLED_IN_POSITION)
  if (currentStatus === "FILLED_IN_POSITION") {
    if (isBuy) {
      // 2A. Cek TP2 (Take Profit Maksimal)
      if (spotPrice >= signal.tp2) {
        const pips = Math.round((signal.tp2 - signal.entryPrice) * 10);
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "CLOSED_TP2",
          tp1Reached: true,
          closedAtPrice: signal.tp2,
          closedAtTime: new Date(now).toISOString(),
          closedReason: `Take Profit 2 Tercapai @ $${signal.tp2.toFixed(2)}`,
          realizedPips: pips,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-tp2-${now}`,
            type: "TP2_HIT",
            title: "🏆 TAKE PROFIT 2 TERCAPAI (FULL WIN)!",
            message: `Harga menyentuh TP2 $${signal.tp2.toFixed(
              2
            )} (+${pips} pips)! Trade BUY selesai dengan sempurna. AI memulai analisa baru...`,
            timestamp: now,
            pips,
          },
          isTradeResolved: true,
        };
      }

      // 2B. Cek SL (Stop Loss)
      if (spotPrice <= signal.stopLoss) {
        const pips = -Math.round((signal.entryPrice - signal.stopLoss) * 10);
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "CLOSED_SL",
          closedAtPrice: signal.stopLoss,
          closedAtTime: new Date(now).toISOString(),
          closedReason: `Stop Loss Tersentuh @ $${signal.stopLoss.toFixed(2)}`,
          realizedPips: pips,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-sl-${now}`,
            type: "SL_HIT",
            title: "🛡️ STOP LOSS TERSENTUH (RISK SECURED)",
            message: `Harga menyentuh SL $${signal.stopLoss.toFixed(
              2
            )} (${pips} pips). Risiko terkontrol rapi. AI akan mengevaluasi kondisi pasar dan mencari setup baru...`,
            timestamp: now,
            pips,
          },
          isTradeResolved: true,
        };
      }

      // 2C. Cek TP1 (Partial Profit / Geser SL ke BEP)
      if (spotPrice >= signal.tp1 && !signal.tp1Reached) {
        const pips = Math.round((signal.tp1 - signal.entryPrice) * 10);
        const updatedSignal: AISignalResult = {
          ...signal,
          tp1Reached: true,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-tp1-${now}`,
            type: "TP1_HIT",
            title: "🎯 TAKE PROFIT 1 TERCAPAI!",
            message: `Harga mencapai target TP1 $${signal.tp1.toFixed(
              2
            )} (+${pips} pips). Disarankan mengamankan profit parsial atau geser SL ke Break-Even (BEP $${signal.entryPrice.toFixed(
              2
            )}).`,
            timestamp: now,
            pips,
          },
          isTradeResolved: false,
        };
      }
    } else {
      // Posisi SELL
      // 2A. Cek TP2 (Take Profit Maksimal)
      if (spotPrice <= signal.tp2) {
        const pips = Math.round((signal.entryPrice - signal.tp2) * 10);
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "CLOSED_TP2",
          tp1Reached: true,
          closedAtPrice: signal.tp2,
          closedAtTime: new Date(now).toISOString(),
          closedReason: `Take Profit 2 Tercapai @ $${signal.tp2.toFixed(2)}`,
          realizedPips: pips,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-tp2-${now}`,
            type: "TP2_HIT",
            title: "🏆 TAKE PROFIT 2 TERCAPAI (FULL WIN)!",
            message: `Harga menyentuh TP2 $${signal.tp2.toFixed(
              2
            )} (+${pips} pips)! Trade SELL selesai dengan sempurna. AI memulai analisa baru...`,
            timestamp: now,
            pips,
          },
          isTradeResolved: true,
        };
      }

      // 2B. Cek SL (Stop Loss)
      if (spotPrice >= signal.stopLoss) {
        const pips = -Math.round((signal.stopLoss - signal.entryPrice) * 10);
        const updatedSignal: AISignalResult = {
          ...signal,
          tradeStatus: "CLOSED_SL",
          closedAtPrice: signal.stopLoss,
          closedAtTime: new Date(now).toISOString(),
          closedReason: `Stop Loss Tersentuh @ $${signal.stopLoss.toFixed(2)}`,
          realizedPips: pips,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-sl-${now}`,
            type: "SL_HIT",
            title: "🛡️ STOP LOSS TERSENTUH (RISK SECURED)",
            message: `Harga menyentuh SL $${signal.stopLoss.toFixed(
              2
            )} (${pips} pips). Risiko terkontrol rapi. AI akan mengevaluasi kondisi pasar dan mencari setup baru...`,
            timestamp: now,
            pips,
          },
          isTradeResolved: true,
        };
      }

      // 2C. Cek TP1
      if (spotPrice <= signal.tp1 && !signal.tp1Reached) {
        const pips = Math.round((signal.entryPrice - signal.tp1) * 10);
        const updatedSignal: AISignalResult = {
          ...signal,
          tp1Reached: true,
        };
        return {
          updatedSignal,
          statusChanged: true,
          alert: {
            id: `alert-tp1-${now}`,
            type: "TP1_HIT",
            title: "🎯 TAKE PROFIT 1 TERCAPAI!",
            message: `Harga mencapai target TP1 $${signal.tp1.toFixed(
              2
            )} (+${pips} pips). Disarankan mengamankan profit parsial atau geser SL ke Break-Even (BEP $${signal.entryPrice.toFixed(
              2
            )}).`,
            timestamp: now,
            pips,
          },
          isTradeResolved: false,
        };
      }
    }
  }

  return {
    updatedSignal: signal,
    statusChanged: false,
    alert: null,
    isTradeResolved: false,
  };
}

