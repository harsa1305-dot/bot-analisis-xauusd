export type Timeframe = "M5" | "M15" | "H1" | "H4";

export type SignalDecision = "BUY" | "SELL" | "WAIT";

/** BUY_LIMIT = antre di bawah harga, SELL_LIMIT = antre di atas harga, NONE = WAIT / watchlist */
export type OrderType = "BUY_LIMIT" | "SELL_LIMIT" | "NONE";

/** Status siklus hidup perdagangan (Trade Lifecycle State) */
export type TradeStatus =
  | "WAITING_FILL"          // Menunggu harga menjemput ke area entry limit
  | "FILLED_IN_POSITION"     // Order sudah terisi, posisi sedang aktif berjalan
  | "CLOSED_TP1"             // Take Profit 1 tercapai
  | "CLOSED_TP2"             // Take Profit 2 (maksimal) tercapai
  | "CLOSED_SL"              // Stop Loss tersentuh
  | "CANCELLED_INVALIDATED"  // Dibatalkan (misal harga menyentuh cancelLevel sebelum terjemput)
  | "STANDBY_WAIT";          // Tidak ada posisi aktif (mode WAIT mencari momen)

export interface Candle {
  time: number; // Unix timestamp in seconds (for lightweight-charts)
  isoTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export interface RecentCandleSummary {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  bodySize: number;
  upperWick: number;
  lowerWick: number;
  pattern: string;
}

export interface TechnicalIndicators {
  ema50: number;
  ema200: number;
  trendAlignment:
    | "STRONG_BULLISH"
    | "BULLISH_PULLBACK"
    | "STRONG_BEARISH"
    | "BEARISH_PULLBACK"
    | "SIDEWAYS_CONSOLIDATION";
  trendDescription: string;
  rsi14: number;
  rsiZone: "OVERBOUGHT" | "BULLISH_MOMENTUM" | "NEUTRAL" | "BEARISH_MOMENTUM" | "OVERSOLD";
  rsiSlope: "RISING" | "FALLING" | "FLAT";
  atr14: number;
  volatilityState: "LOW" | "NORMAL" | "HIGH_VOLATILITY";
}

export interface KeyLevels {
  nearestResistance: number;
  majorResistance: number;
  nearestSupport: number;
  majorSupport: number;
  distanceToResistance: number;
  distanceToSupport: number;
  safeSlBuffer: number; // 1.5x ATR buffer for stop-hunt protection
}

/* ---------------------------------------------------------------------------
 * Struktur Pasar & Pencari Momen Limit Order (Smart-Money style, murni matematika)
 * ------------------------------------------------------------------------- */

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: "HIGH" | "LOW";
}

export interface SmartZone {
  kind: "OB" | "FVG";
  side: "BULLISH" | "BEARISH";
  low: number;
  high: number;
  time: number;
  candlesAgo: number;
}

export interface StructureBreak {
  type: "BOS" | "CHOCH";
  direction: "BULLISH" | "BEARISH";
  level: number;
  time: number;
  candlesAgo: number;
}

export interface LiquiditySweep {
  /** SELL_SIDE = low disapu lalu ditutup kembali di atas (bullish), BUY_SIDE = high disapu (bearish) */
  side: "SELL_SIDE" | "BUY_SIDE";
  level: number;
  time: number;
  candlesAgo: number;
  wickPts: number;
}

export interface LimitCandidate {
  id: string;
  orderType: "BUY_LIMIT" | "SELL_LIMIT";
  setupType: string;
  entryLow: number;
  entryHigh: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rr1: number;
  rr2: number;
  /** Skor konfluensi 0-100 */
  score: number;
  reasons: string[];
  distanceFromPrice: number;
  /** Jika harga menyentuh level ini sebelum order terisi, setup dianggap batal (target sudah lewat) */
  cancelLevel: number;
  expiresInCandles: number;
}

export interface MarketStructure {
  trend: "BULLISH" | "BEARISH" | "RANGING";
  lastBreak: StructureBreak | null;
  recentSweeps: LiquiditySweep[];
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  pricePosition: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
  positionPct: number;
  swings: SwingPoint[];
  zones: SmartZone[];
  candidates: LimitCandidate[];
}

/* ---------------------------------------------------------------------------
 * News / Kalender Ekonomi
 * ------------------------------------------------------------------------- */

export type NewsImpact = "High" | "Medium";

export type NewsPhase =
  | "CLEAR"
  | "PRE_NEWS"
  | "NEWS_RELEASE"
  | "POST_NEWS_SETTLING"
  | "UNKNOWN";

export interface NewsEvent {
  title: string;
  country: string;
  timeMs: number;
  impact: NewsImpact;
  forecast: string;
  previous: string;
  /** Efek ke USD bila angka aktual LEBIH TINGGI dari forecast */
  usdBiasIfAbove: "UP" | "DOWN" | "NEUTRAL";
}

export interface NewsScenario {
  eventTitle: string;
  timeMs: number;
  impact: NewsImpact;
  forecast: string;
  previous: string;
  ifAbove: { goldBias: "BULLISH" | "BEARISH" | "MIXED"; text: string };
  ifBelow: { goldBias: "BULLISH" | "BEARISH" | "MIXED"; text: string };
  plan: string;
}

export interface SpikeAnalysis {
  eventTitle: string;
  eventTimeMs: number;
  minutesSince: number;
  spikeDetected: boolean;
  direction: "UP" | "DOWN" | "NONE";
  rangePts: number;
  rangeAtr: number;
  wickRejection: "UPPER" | "LOWER" | "NONE";
  retracedPct: number;
  settled: boolean;
  reliable: boolean;
  summary: string;
}

export interface NewsContext {
  available: boolean;
  source: string;
  fetchedAt: number;
  events: NewsEvent[];
  phase: NewsPhase;
  minutesToNextHigh: number | null;
  minutesSinceLastHigh: number | null;
  nextHigh: NewsEvent | null;
  lastHigh: NewsEvent | null;
  caution: string | null;
  spike: SpikeAnalysis | null;
  scenarios: NewsScenario[];
  guidance: string;
}

export interface PreProcessedMarketData {
  symbol: string;
  dataSource: string;
  timeframe: Timeframe;
  timestamp: string;
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  indicators: TechnicalIndicators;
  keyLevels: KeyLevels;
  recentCandles: RecentCandleSummary[];
  structure: MarketStructure;
}

export interface AISignalResult {
  id: string;
  timestamp: string;
  timeframe: Timeframe;
  symbol: string;
  signal: SignalDecision;
  /** Jenis order pending. Data lama (sebelum fitur limit) tidak punya field ini */
  orderType?: OrderType;
  setupType?: string;
  confidence: number;
  currentPrice: number;
  entryPrice: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  slPips: number;
  tp1Pips: number;
  tp2Pips: number;
  riskRewardRatio: string;
  marketBias: string;
  reasoning: string;
  keyFactors: string[];
  cancelLevel?: number;
  expiresInCandles?: number;
  newsPhase?: NewsPhase;
  newsImpact?: string;
  confluenceScore?: number;
  /** Skenario alternatif dua arah (misal jika sinyal utama BUY LIMIT, alternatifnya SELL LIMIT) */
  alternativeSetup?: LimitCandidate;
  aiEngine: "OPENAI_GPT" | "GEMINI_2_5_FLASH" | "QUANT_FALLBACK_ENGINE" | "OLLAMA_LOCAL";
  aiModelName?: string;
  triggerType: "MANUAL" | "AUTO_24H";
  /** Status siklus hidup perdagangan saat ini */
  tradeStatus?: TradeStatus;
  filledAtPrice?: number;
  filledAtTime?: string;
  tp1Reached?: boolean;
  closedAtPrice?: number;
  closedAtTime?: string;
  closedReason?: string;
  realizedPips?: number;
  indicatorsSnapshot: {
    ema50: number;
    ema200: number;
    rsi14: number;
    atr14: number;
    nearestSupport: number;
    nearestResistance: number;
  };
}

export interface ChatMessage {
  id: string;
  sender: "user" | "analyst";
  text: string;
  timestamp: number;
  quickAction?: string;
}

export interface AnalystAlert {
  id: string;
  type:
    | "SIGNAL_NEW"
    | "ORDER_FILLED"
    | "TP1_HIT"
    | "TP2_HIT"
    | "SL_HIT"
    | "ORDER_CANCELLED"
    | "ANALYSIS_STARTED";
  title: string;
  message: string;
  timestamp: number;
  pips?: number;
}

export interface AnalyzeGoldResponse {
  success: boolean;
  marketData: PreProcessedMarketData;
  candles: Candle[];
  ema50Series: LinePoint[];
  ema200Series: LinePoint[];
  signal: AISignalResult;
  history: AISignalResult[];
  news: NewsContext;
  config: {
    autoMonitorEnabled: boolean;
    intervalMinutes: number;
    activeTimeframe: Timeframe;
    openaiModel: string;
    hasOpenaiKey: boolean;
    hasGeminiKey: boolean;
    hasTwelveDataKey: boolean;
    useOllama?: boolean;
    ollamaModel?: string;
    ollamaBaseUrl?: string;
    hasOllama?: boolean;
  };
  error?: string;
}
