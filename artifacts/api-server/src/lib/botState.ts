export type BotPhase =
  | "idle"
  | "waiting_open"
  | "building_range"
  | "watching"
  | "in_trade"
  | "closed";

export type BreakoutDirection = "long" | "short" | "none";

export interface SessionState {
  symbol: string;
  phase: BotPhase;
  date: string;
  orbHigh: number | null;
  orbLow: number | null;
  orbWidth: number | null;
  currentPrice: number | null;
  volume: number | null;
  averageVolume: number | null;
  volumeRatio: number | null;
  openRangeStart: string | null;
  openRangeEnd: string | null;
  breakoutDirection: BreakoutDirection | null;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  currentPnl: number | null;
  longTradeUsed: boolean;
  shortTradeUsed: boolean;
  qty: number | null;
  alpacaOrderId: string | null;
}

export interface BotState {
  running: boolean;
  symbol: string;
  phase: BotPhase;
  startedAt: string | null;
  stoppedAt: string | null;
  lastUpdated: string | null;
  error: string | null;
  session: SessionState | null;
  loopTimer: ReturnType<typeof setInterval> | null;
}

const today = (): string => new Date().toISOString().split("T")[0]!;

export const createEmptySession = (symbol: string): SessionState => ({
  symbol,
  phase: "waiting_open",
  date: today(),
  orbHigh: null,
  orbLow: null,
  orbWidth: null,
  currentPrice: null,
  volume: null,
  averageVolume: null,
  volumeRatio: null,
  openRangeStart: null,
  openRangeEnd: null,
  breakoutDirection: null,
  entryPrice: null,
  stopPrice: null,
  targetPrice: null,
  currentPnl: null,
  longTradeUsed: false,
  shortTradeUsed: false,
  qty: null,
  alpacaOrderId: null,
});

export const botState: BotState = {
  running: false,
  symbol: "",
  phase: "idle",
  startedAt: null,
  stoppedAt: null,
  lastUpdated: null,
  error: null,
  session: null,
  loopTimer: null,
};
