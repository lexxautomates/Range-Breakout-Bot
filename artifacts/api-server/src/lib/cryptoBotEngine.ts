/**
 * Crypto.com ORB-style Bot Engine
 *
 * Adapts the Opening Range Breakout (ORB) strategy for 24/7 crypto markets.
 * Instead of US market open, uses configurable "session windows" (e.g. hourly
 * or daily at UTC midnight).
 *
 * Strategy:
 *  1. Build "opening range" during first N minutes of a session window.
 *  2. Detect breakout above high (long) or below low (short).
 *  3. Confirm with volume (optional).
 *  4. Enter position; set stop at opposite side of range.
 *  5. Take profit at configurable R:R ratio.
 *  6. Support trailing stop + re-entry.
 */

import { CryptoDotComClient } from "./cryptocom.js";
import { db } from "@workspace/db";
import { tradesTable, botInstancesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { askLlmAdvisor, type LlmConfig } from "./llmAdvisor.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CryptoBotPhase =
  | "waiting"
  | "building_range"
  | "watching"
  | "in_trade"
  | "closed";

export interface CryptoBotConfig {
  symbol: string;
  sessionWindowMinutes: number;
  riskPercent: number;
  rewardRiskRatio: number;
  requireVolumeConfirmation: boolean;
  volumeMultiplier: number;
  trailingStopEnabled: boolean;
  trailingStopActivationR: number;
  reEntryEnabled: boolean;
  maxOrbWidthPercent: number;
  minOrbWidthPercent: number;
  breakoutWindowMinutes: number;
  sessionType: "hourly" | "daily";
  enableShorts: boolean;
}

export interface CryptoBotSession {
  phase: CryptoBotPhase;
  orbHigh: number | null;
  orbLow: number | null;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  direction: "long" | "short" | null;
  qty: number | null;
  orderId: string | null;
  trailingStopPrice: number | null;
  sessionStart: Date | null;
  sessionLabel: string;
  reEntryDone: boolean;
  tradeCount: number;
}

export interface CryptoBotState {
  id: string;
  config: CryptoBotConfig;
  session: CryptoBotSession;
  instanceId: number | null;
  createdAt: Date;
  stoppedAt: Date | null;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const cryptoBotRegistry = new Map<string, { state: CryptoBotState; timer: NodeJS.Timeout }>();

export function getCryptoBots(): CryptoBotState[] {
  return Array.from(cryptoBotRegistry.values()).map((e) => e.state);
}

export function getCryptoBot(id: string): CryptoBotState | null {
  return cryptoBotRegistry.get(id)?.state ?? null;
}

export function stopCryptoBot(id: string): boolean {
  const entry = cryptoBotRegistry.get(id);
  if (!entry) return false;
  clearInterval(entry.timer);
  entry.state.session.phase = "closed";
  entry.state.stoppedAt = new Date();
  cryptoBotRegistry.delete(id);
  logger.info({ id }, "[CryptoBot] stopped");
  return true;
}

// ─── Session window helpers ───────────────────────────────────────────────────

function getSessionLabel(type: "hourly" | "daily"): string {
  const now = new Date();
  if (type === "hourly") {
    return `${now.toISOString().slice(0, 13)}:00Z`;
  }
  return now.toISOString().slice(0, 10);
}

function getSessionStart(type: "hourly" | "daily"): Date {
  const now = new Date();
  if (type === "hourly") {
    const start = new Date(now);
    start.setUTCMinutes(0, 0, 0);
    return start;
  }
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function minutesSinceSessionStart(sessionStart: Date): number {
  return (Date.now() - sessionStart.getTime()) / 60000;
}

// ─── Volume helpers ────────────────────────────────────────────────────────────

async function getAverageVolume(
  client: CryptoDotComClient,
  symbol: string,
  periods = 10,
): Promise<number> {
  try {
    const candles = await client.getCandlesticks(symbol, "1h", periods + 5);
    if (candles.length < 2) return 0;
    const vols = candles.slice(0, periods).map((c) => parseFloat(c.v));
    return vols.reduce((a, b) => a + b, 0) / vols.length;
  } catch {
    return 0;
  }
}

async function getRecentVolume(
  client: CryptoDotComClient,
  symbol: string,
  sessionStart: Date,
): Promise<number> {
  try {
    const candles = await client.getCandlesticks(symbol, "1m", 60);
    const cutoff = sessionStart.getTime();
    const sessionCandles = candles.filter((c) => c.t >= cutoff);
    return sessionCandles.reduce((sum, c) => sum + parseFloat(c.v), 0);
  } catch {
    return 0;
  }
}

// ─── Range building ────────────────────────────────────────────────────────────

async function buildOpeningRange(
  client: CryptoDotComClient,
  symbol: string,
  sessionStart: Date,
  windowMinutes: number,
): Promise<{ high: number; low: number; volume: number } | null> {
  try {
    const endTs = sessionStart.getTime() + windowMinutes * 60 * 1000;
    if (Date.now() < endTs) return null;

    const candles = await client.getCandlesticks(symbol, "1m", windowMinutes + 5);
    const startTs = sessionStart.getTime();

    const rangeCandles = candles.filter((c) => c.t >= startTs && c.t < endTs);
    if (rangeCandles.length === 0) return null;

    const high = Math.max(...rangeCandles.map((c) => parseFloat(c.h)));
    const low = Math.min(...rangeCandles.map((c) => parseFloat(c.l)));
    const volume = rangeCandles.reduce((sum, c) => sum + parseFloat(c.v), 0);

    return { high, low, volume };
  } catch {
    return null;
  }
}

// ─── Bot loop ──────────────────────────────────────────────────────────────────

async function runCryptoBotLoop(
  state: CryptoBotState,
  client: CryptoDotComClient,
  llmConfig: LlmConfig,
): Promise<void> {
  const { config, session } = state;

  try {
    const currentLabel = getSessionLabel(config.sessionType);

    // New session → reset
    if (session.sessionLabel !== currentLabel) {
      const prevPhase = session.phase;
      if (prevPhase === "in_trade") {
        logger.info({ id: state.id }, "[CryptoBot] New session while in trade — holding position");
      } else {
        session.phase = "waiting";
        session.orbHigh = null;
        session.orbLow = null;
        session.entryPrice = null;
        session.stopPrice = null;
        session.targetPrice = null;
        session.direction = null;
        session.qty = null;
        session.orderId = null;
        session.trailingStopPrice = null;
        session.reEntryDone = false;
        session.sessionLabel = currentLabel;
        session.sessionStart = getSessionStart(config.sessionType);
        logger.info({ id: state.id, session: currentLabel }, "[CryptoBot] New session started");
      }
    }

    const price = await client.getMidPrice(config.symbol);
    if (!price) return;

    const sessionStart = session.sessionStart ?? getSessionStart(config.sessionType);
    const minutesSinceStart = minutesSinceSessionStart(sessionStart);

    // ── Phase: waiting → building_range
    if (session.phase === "waiting") {
      session.sessionStart = sessionStart;
      session.sessionLabel = currentLabel;
      session.phase = "building_range";
    }

    // ── Phase: building_range → watching
    if (session.phase === "building_range") {
      if (minutesSinceStart < config.sessionWindowMinutes) return;

      const range = await buildOpeningRange(
        client,
        config.symbol,
        sessionStart,
        config.sessionWindowMinutes,
      );
      if (!range) return;

      const width = range.high - range.low;
      const widthPct = (width / range.low) * 100;

      if (widthPct < config.minOrbWidthPercent) {
        logger.info(
          { id: state.id, widthPct, min: config.minOrbWidthPercent },
          "[CryptoBot] ORB too narrow — skipping session",
        );
        session.phase = "closed";
        return;
      }
      if (widthPct > config.maxOrbWidthPercent) {
        logger.info(
          { id: state.id, widthPct, max: config.maxOrbWidthPercent },
          "[CryptoBot] ORB too wide — skipping session",
        );
        session.phase = "closed";
        return;
      }

      session.orbHigh = range.high;
      session.orbLow = range.low;
      session.phase = "watching";
      logger.info(
        { id: state.id, high: range.high, low: range.low, widthPct },
        "[CryptoBot] Range built — watching for breakout",
      );
      return;
    }

    // ── Phase: watching → in_trade
    if (session.phase === "watching") {
      const { orbHigh, orbLow } = session;
      if (!orbHigh || !orbLow) return;

      if (minutesSinceStart > config.sessionWindowMinutes + config.breakoutWindowMinutes) {
        logger.info({ id: state.id }, "[CryptoBot] Breakout window expired");
        session.phase = "closed";
        return;
      }

      const isLongBreakout = price > orbHigh;
      const isShortBreakout = config.enableShorts && price < orbLow;

      if (!isLongBreakout && !isShortBreakout) return;

      const direction: "long" | "short" = isLongBreakout ? "long" : "short";

      // Volume check
      if (config.requireVolumeConfirmation) {
        const avgVol = await getAverageVolume(client, config.symbol);
        const recentVol = await getRecentVolume(client, config.symbol, sessionStart);
        const volRatio = avgVol > 0 ? recentVol / avgVol : 0;

        if (volRatio < config.volumeMultiplier) {
          logger.info(
            { id: state.id, volRatio, required: config.volumeMultiplier },
            "[CryptoBot] Insufficient volume — no entry",
          );
          return;
        }
      }

      // LLM advisor check
      const orbWidth = orbHigh - orbLow;
      const avgVol2 = await getAverageVolume(client, config.symbol);
      const recentVol2 = await getRecentVolume(client, config.symbol, sessionStart);
      const volRatio = avgVol2 > 0 ? recentVol2 / avgVol2 : 1;

      const llmApproval = await askLlmAdvisor(llmConfig, {
        symbol: config.symbol,
        direction,
        currentPrice: price,
        orbHigh,
        orbLow,
        orbWidth,
        orbWidthPercent: (orbWidth / orbLow) * 100,
        volumeRatio: volRatio,
        minutesSinceOpen: minutesSinceStart,
        sessionDate: currentLabel,
        broker: "cryptocom",
      });

      if (!llmApproval.approved) {
        logger.info(
          { id: state.id, reason: llmApproval.reasoning },
          "[CryptoBot] LLM vetoed entry",
        );
        return;
      }

      // Calculate position size
      const stopPrice =
        direction === "long"
          ? orbLow
          : orbHigh;
      const riskPerUnit = Math.abs(price - stopPrice);
      if (riskPerUnit === 0) return;

      const balance = await client.getUsdBalance();
      const riskAmount = (balance.available * config.riskPercent) / 100;
      const qty = parseFloat((riskAmount / riskPerUnit).toFixed(6));
      const targetPrice =
        direction === "long"
          ? price + riskPerUnit * config.rewardRiskRatio
          : price - riskPerUnit * config.rewardRiskRatio;

      // Place market order
      const orderId = await client.createMarketOrder(
        config.symbol,
        direction === "long" ? "BUY" : "SELL",
        qty,
        `orb-${state.id}-${Date.now()}`,
      );

      if (!orderId) {
        logger.error({ id: state.id }, "[CryptoBot] Market order failed");
        return;
      }

      session.entryPrice = price;
      session.stopPrice = stopPrice;
      session.targetPrice = targetPrice;
      session.direction = direction;
      session.qty = qty;
      session.orderId = orderId;
      session.phase = "in_trade";
      session.trailingStopPrice = null;

      logger.info(
        {
          id: state.id,
          direction,
          price,
          stop: stopPrice,
          target: targetPrice,
          qty,
        },
        "[CryptoBot] Entered trade",
      );
      return;
    }

    // ── Phase: in_trade → exit logic
    if (session.phase === "in_trade") {
      const { entryPrice, stopPrice, targetPrice, direction, qty } = session;
      if (!entryPrice || !stopPrice || !targetPrice || !direction || !qty) return;

      const riskPerUnit = Math.abs(entryPrice - stopPrice);
      const unrealizedR =
        direction === "long"
          ? (price - entryPrice) / riskPerUnit
          : (entryPrice - price) / riskPerUnit;

      // Trailing stop activation
      if (
        config.trailingStopEnabled &&
        unrealizedR >= config.trailingStopActivationR &&
        !session.trailingStopPrice
      ) {
        session.trailingStopPrice =
          direction === "long"
            ? price - riskPerUnit
            : price + riskPerUnit;
        logger.info(
          { id: state.id, trail: session.trailingStopPrice },
          "[CryptoBot] Trailing stop activated",
        );
      }

      // Update trailing stop
      if (session.trailingStopPrice) {
        if (direction === "long" && price - riskPerUnit > session.trailingStopPrice) {
          session.trailingStopPrice = price - riskPerUnit;
        } else if (direction === "short" && price + riskPerUnit < session.trailingStopPrice) {
          session.trailingStopPrice = price + riskPerUnit;
        }
      }

      const effectiveStop = session.trailingStopPrice ?? stopPrice;

      const hitStop =
        direction === "long" ? price <= effectiveStop : price >= effectiveStop;
      const hitTarget =
        direction === "long" ? price >= targetPrice : price <= targetPrice;

      if (!hitStop && !hitTarget) return;

      const exitReason = hitTarget ? "target" : "stop";
      const exitPrice = price;
      const pnl = direction === "long"
        ? (exitPrice - entryPrice) * qty
        : (entryPrice - exitPrice) * qty;
      const rMultiple = (exitPrice - entryPrice) / (direction === "long" ? riskPerUnit : -riskPerUnit);

      // Close position
      await client.cancelAllOrders(config.symbol);
      await client.createMarketOrder(
        config.symbol,
        direction === "long" ? "SELL" : "BUY",
        qty,
        `orb-exit-${state.id}-${Date.now()}`,
      );

      // Record trade in DB
      try {
        const instanceRow = await db
          .insert(botInstancesTable)
          .values({
            symbol: config.symbol,
            generation: 0,
            configSnapshot: config as unknown as Record<string, unknown>,
            avgRMultiple: rMultiple,
            totalTrades: session.tradeCount + 1,
          })
          .returning({ id: botInstancesTable.id });

        const instanceId = instanceRow[0]?.id ?? null;

        await db.insert(tradesTable).values({
          symbol: config.symbol,
          botInstanceId: instanceId,
          direction,
          entryPrice,
          exitPrice,
          stopPrice,
          targetPrice,
          qty: Math.round(qty * 1e6) / 1e6,
          pnl,
          rMultiple,
          outcome: rMultiple > 0 ? "win" : rMultiple < 0 ? "loss" : "breakeven",
          entryTime: new Date(Date.now() - 5 * 60 * 1000),
          exitTime: new Date(),
          exitReason,
          orbHigh: session.orbHigh ?? 0,
          orbLow: session.orbLow ?? 0,
          volumeRatio: null,
          date: new Date().toISOString().slice(0, 10),
        });
      } catch (dbErr) {
        logger.error({ dbErr }, "[CryptoBot] Failed to record trade in DB");
      }

      session.tradeCount += 1;

      logger.info(
        { id: state.id, exitReason, pnl, rMultiple },
        "[CryptoBot] Trade closed",
      );

      // Re-entry or close session
      if (config.reEntryEnabled && !session.reEntryDone && exitReason === "stop") {
        session.phase = "watching";
        session.entryPrice = null;
        session.orderId = null;
        session.reEntryDone = true;
        logger.info({ id: state.id }, "[CryptoBot] Re-entry enabled — watching again");
      } else {
        session.phase = "closed";
        state.stoppedAt = new Date();
        cryptoBotRegistry.delete(state.id);
        logger.info({ id: state.id }, "[CryptoBot] Session complete — bot stopped");
      }
    }
  } catch (err) {
    logger.error({ err, id: state.id }, "[CryptoBot] Loop error");
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface StartCryptoBotOptions {
  config: CryptoBotConfig;
  client: CryptoDotComClient;
  llmConfig: LlmConfig;
}

export function startCryptoBot(options: StartCryptoBotOptions): CryptoBotState {
  const { config, client, llmConfig } = options;
  const id = `crypto-${config.symbol}-${Date.now()}`;

  const session: CryptoBotSession = {
    phase: "waiting",
    orbHigh: null,
    orbLow: null,
    entryPrice: null,
    stopPrice: null,
    targetPrice: null,
    direction: null,
    qty: null,
    orderId: null,
    trailingStopPrice: null,
    sessionStart: getSessionStart(config.sessionType),
    sessionLabel: getSessionLabel(config.sessionType),
    reEntryDone: false,
    tradeCount: 0,
  };

  const state: CryptoBotState = {
    id,
    config,
    session,
    instanceId: null,
    createdAt: new Date(),
    stoppedAt: null,
  };

  const timer = setInterval(
    () => runCryptoBotLoop(state, client, llmConfig),
    30_000,
  );

  cryptoBotRegistry.set(id, { state, timer });

  logger.info({ id, symbol: config.symbol }, "[CryptoBot] Started");

  void runCryptoBotLoop(state, client, llmConfig);

  return state;
}

export const DEFAULT_CRYPTO_BOT_CONFIG: CryptoBotConfig = {
  symbol: "BTC_USD",
  sessionWindowMinutes: 30,
  riskPercent: 1,
  rewardRiskRatio: 2,
  requireVolumeConfirmation: false,
  volumeMultiplier: 1.2,
  trailingStopEnabled: false,
  trailingStopActivationR: 1.0,
  reEntryEnabled: false,
  maxOrbWidthPercent: 5,
  minOrbWidthPercent: 0.1,
  breakoutWindowMinutes: 360,
  sessionType: "hourly",
  enableShorts: false,
};
