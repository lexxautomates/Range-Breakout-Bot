import { alpaca, apiKey, apiSecret, dataBaseUrl } from "./alpaca.js";
import { botState, createEmptySession, type BotPhase } from "./botState.js";
import { db } from "@workspace/db";
import { tradesTable, botConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

// Eastern time helpers
function getEasternTime(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function getMinutesAfterOpen(et: Date): number {
  const marketOpen = new Date(et);
  marketOpen.setHours(9, 30, 0, 0);
  return (et.getTime() - marketOpen.getTime()) / 60000;
}

function isMarketHours(et: Date): boolean {
  const h = et.getHours();
  const m = et.getMinutes();
  const totalMins = h * 60 + m;
  return totalMins >= 9 * 60 + 30 && totalMins < 16 * 60;
}

async function getConfig() {
  const rows = await db.select().from(botConfigTable).limit(1);
  if (rows.length === 0) {
    // Insert default config
    const [cfg] = await db.insert(botConfigTable).values({}).returning();
    return cfg!;
  }
  return rows[0]!;
}

async function fetchBars(symbol: string, timeframe: string, limit: number) {
  const url = `${dataBaseUrl}/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&adjustment=raw&feed=iex`;
  const resp = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
    },
  });
  if (!resp.ok) {
    throw new Error(`Bars fetch failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json() as { bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> };
  return data.bars ?? [];
}

async function fetchLatestQuote(symbol: string): Promise<number | null> {
  try {
    const url = `${dataBaseUrl}/v2/stocks/${symbol}/quotes/latest?feed=iex`;
    const resp = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { quote?: { ap?: number; bp?: number } };
    const quote = data.quote;
    if (!quote) return null;
    const ask = quote.ap ?? 0;
    const bid = quote.bp ?? 0;
    if (ask > 0 && bid > 0) return (ask + bid) / 2;
    return ask || bid || null;
  } catch {
    return null;
  }
}

async function getAverageVolume(symbol: string, days = 10): Promise<number> {
  try {
    const bars = await fetchBars(symbol, "1Day", days + 1);
    if (bars.length < 2) return 0;
    const vols = bars.slice(0, bars.length - 1).map((b) => b.v);
    return vols.reduce((a, b) => a + b, 0) / vols.length;
  } catch {
    return 0;
  }
}

async function placeMarketOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<string | null> {
  try {
    const order = await alpaca.createOrder({
      symbol,
      qty,
      side,
      type: "market",
      time_in_force: "day",
    });
    return (order as { id: string }).id;
  } catch (err) {
    logger.error({ err }, "Failed to place order");
    return null;
  }
}

async function closePosition(symbol: string): Promise<void> {
  try {
    await alpaca.closePosition(symbol);
  } catch (err) {
    logger.error({ err }, "Failed to close position");
  }
}

async function recordTrade(params: {
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  stopPrice: number;
  targetPrice: number;
  qty: number;
  exitReason: string;
  orbHigh: number | null;
  orbLow: number | null;
  volumeRatio: number | null;
  entryTime: Date;
}) {
  const { direction, entryPrice, exitPrice, stopPrice, qty, orbHigh, orbLow } = params;
  const pricePnl = direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pnl = pricePnl * qty;
  const riskPerShare = Math.abs(entryPrice - stopPrice);
  const rMultiple = riskPerShare > 0 ? pricePnl / riskPerShare : 0;
  const outcome: "win" | "loss" | "breakeven" = pnl > 0.01 ? "win" : pnl < -0.01 ? "loss" : "breakeven";
  const date = params.entryTime.toISOString().split("T")[0]!;

  await db.insert(tradesTable).values({
    symbol: params.symbol,
    direction: params.direction,
    entryPrice,
    exitPrice,
    stopPrice,
    targetPrice: params.targetPrice,
    qty,
    pnl,
    rMultiple,
    outcome,
    entryTime: params.entryTime,
    exitTime: new Date(),
    exitReason: params.exitReason,
    orbHigh,
    orbLow,
    volumeRatio: params.volumeRatio,
    date,
  });
}

export async function runBotLoop(): Promise<void> {
  if (!botState.running || !botState.session) return;

  const session = botState.session;
  const config = await getConfig();
  const et = getEasternTime();

  try {
    const minsAfterOpen = getMinutesAfterOpen(et);
    const inMarket = isMarketHours(et);

    if (!inMarket) {
      if (minsAfterOpen >= 0) {
        // Market closed — wrap up
        if (session.phase === "in_trade") {
          await closePosition(session.symbol);
          if (session.currentPrice && session.entryPrice && session.qty) {
            await recordTrade({
              symbol: session.symbol,
              direction: session.breakoutDirection as "long" | "short",
              entryPrice: session.entryPrice,
              exitPrice: session.currentPrice,
              stopPrice: session.stopPrice!,
              targetPrice: session.targetPrice!,
              qty: session.qty,
              exitReason: "market_close",
              orbHigh: session.orbHigh,
              orbLow: session.orbLow,
              volumeRatio: session.volumeRatio,
              entryTime: new Date(botState.startedAt!),
            });
          }
        }
        session.phase = "closed";
        botState.phase = "closed";
      }
      botState.lastUpdated = new Date().toISOString();
      return;
    }

    // Get latest price
    const price = await fetchLatestQuote(session.symbol);
    if (price) session.currentPrice = price;

    // --- PHASE: waiting_open (before 9:30) ---
    if (session.phase === "waiting_open") {
      if (minsAfterOpen >= 0) {
        session.phase = "building_range";
        botState.phase = "building_range";
        session.openRangeStart = et.toISOString();
      }
    }

    // --- PHASE: building_range ---
    else if (session.phase === "building_range") {
      if (minsAfterOpen < config.openingRangeMinutes) {
        // Still building ORB
        const bars = await fetchBars(session.symbol, "1Min", config.openingRangeMinutes + 2);
        const todayBars = bars.filter((b) => {
          const bt = new Date(b.t);
          return getMinutesAfterOpen(new Date(bt.toLocaleString("en-US", { timeZone: "America/New_York" }))) >= 0;
        });

        if (todayBars.length > 0) {
          session.orbHigh = Math.max(...todayBars.map((b) => b.h));
          session.orbLow = Math.min(...todayBars.map((b) => b.l));
          session.orbWidth = session.orbHigh - session.orbLow;

          const vol = todayBars.reduce((sum, b) => sum + b.v, 0);
          session.volume = vol;
        }
      } else {
        // ORB window complete
        session.openRangeEnd = et.toISOString();
        session.averageVolume = await getAverageVolume(session.symbol);

        if (session.orbHigh && session.orbLow && price) {
          const orbWidth = session.orbHigh - session.orbLow;
          const widthPct = (orbWidth / price) * 100;

          if (widthPct > config.maxOrbWidthPercent || widthPct < config.minOrbWidthPercent) {
            logger.info({ widthPct, max: config.maxOrbWidthPercent, min: config.minOrbWidthPercent }, "ORB width filter — skipping session");
            session.phase = "closed";
            botState.phase = "closed";
          } else {
            session.phase = "watching";
            botState.phase = "watching";
          }
        } else {
          session.phase = "watching";
          botState.phase = "watching";
        }
      }
    }

    // --- PHASE: watching ---
    else if (session.phase === "watching") {
      const breakoutDeadline = config.openingRangeMinutes + config.breakoutWindowMinutes;
      if (minsAfterOpen > breakoutDeadline) {
        session.phase = "closed";
        botState.phase = "closed";
        return;
      }

      if (!session.orbHigh || !session.orbLow || !price) return;

      // Volume check
      let volOk = true;
      if (config.requireVolumeConfirmation && session.averageVolume && session.averageVolume > 0) {
        const bars = await fetchBars(session.symbol, "1Min", 2);
        const latestVol = bars[bars.length - 1]?.v ?? 0;
        session.volume = latestVol;
        session.volumeRatio = latestVol / (session.averageVolume / 390); // per-minute avg
        volOk = session.volumeRatio >= config.volumeMultiplier;
      }

      const canLong = !session.longTradeUsed || config.reEntryEnabled;
      const canShort = !session.shortTradeUsed || config.reEntryEnabled;

      // Long breakout: price closes above ORB high
      if (price > session.orbHigh && canLong && volOk) {
        const stopPrice = config.useModerateRisk
          ? (session.orbHigh + session.orbLow) / 2
          : session.orbLow;
        const riskPerShare = price - stopPrice;
        const targetPrice = price + riskPerShare * config.rewardRiskRatio;

        // Position sizing
        const account = await alpaca.getAccount() as { equity: string };
        const equity = parseFloat(account.equity);
        const riskDollars = equity * (config.riskPercent / 100);
        const qty = Math.max(1, Math.floor(riskDollars / riskPerShare));

        const orderId = await placeMarketOrder(session.symbol, "buy", qty);
        if (orderId) {
          session.breakoutDirection = "long";
          session.entryPrice = price;
          session.stopPrice = stopPrice;
          session.targetPrice = targetPrice;
          session.qty = qty;
          session.alpacaOrderId = orderId;
          session.phase = "in_trade";
          botState.phase = "in_trade";
          session.longTradeUsed = true;
          logger.info({ price, stopPrice, targetPrice, qty }, "Long breakout entry");
        }
      }

      // Short breakout: price closes below ORB low
      else if (price < session.orbLow && canShort && volOk) {
        const stopPrice = config.useModerateRisk
          ? (session.orbHigh + session.orbLow) / 2
          : session.orbHigh;
        const riskPerShare = stopPrice - price;
        const targetPrice = price - riskPerShare * config.rewardRiskRatio;

        const account = await alpaca.getAccount() as { equity: string };
        const equity = parseFloat(account.equity);
        const riskDollars = equity * (config.riskPercent / 100);
        const qty = Math.max(1, Math.floor(riskDollars / riskPerShare));

        const orderId = await placeMarketOrder(session.symbol, "sell", qty);
        if (orderId) {
          session.breakoutDirection = "short";
          session.entryPrice = price;
          session.stopPrice = stopPrice;
          session.targetPrice = targetPrice;
          session.qty = qty;
          session.alpacaOrderId = orderId;
          session.phase = "in_trade";
          botState.phase = "in_trade";
          session.shortTradeUsed = true;
          logger.info({ price, stopPrice, targetPrice, qty }, "Short breakout entry");
        }
      }
    }

    // --- PHASE: in_trade ---
    else if (session.phase === "in_trade") {
      if (!price || !session.entryPrice || !session.stopPrice || !session.targetPrice || !session.qty) return;

      const direction = session.breakoutDirection as "long" | "short";
      const pricePnl = direction === "long" ? price - session.entryPrice : session.entryPrice - price;
      session.currentPnl = pricePnl * session.qty;

      const riskPerShare = Math.abs(session.entryPrice - session.stopPrice);
      const currentR = riskPerShare > 0 ? pricePnl / riskPerShare : 0;

      let exitReason: string | null = null;

      // Stop loss hit
      if (direction === "long" && price <= session.stopPrice) {
        exitReason = "stop_loss";
      } else if (direction === "short" && price >= session.stopPrice) {
        exitReason = "stop_loss";
      }

      // Take profit hit
      if (direction === "long" && price >= session.targetPrice) {
        exitReason = "take_profit";
      } else if (direction === "short" && price <= session.targetPrice) {
        exitReason = "take_profit";
      }

      // Re-entry into ORB zone (early exit)
      if (!exitReason && session.orbHigh && session.orbLow) {
        if (price < session.orbHigh && price > session.orbLow) {
          exitReason = "re_entered_range";
        }
      }

      // Trailing stop
      if (!exitReason && config.trailingStopEnabled && currentR >= config.trailingStopActivationR) {
        const trailStop = direction === "long"
          ? price - riskPerShare
          : price + riskPerShare;
        if (direction === "long" && trailStop > session.stopPrice) {
          session.stopPrice = trailStop;
        } else if (direction === "short" && trailStop < session.stopPrice) {
          session.stopPrice = trailStop;
        }
      }

      if (exitReason) {
        await closePosition(session.symbol);
        await recordTrade({
          symbol: session.symbol,
          direction,
          entryPrice: session.entryPrice,
          exitPrice: price,
          stopPrice: session.stopPrice,
          targetPrice: session.targetPrice,
          qty: session.qty,
          exitReason,
          orbHigh: session.orbHigh,
          orbLow: session.orbLow,
          volumeRatio: session.volumeRatio,
          entryTime: new Date(botState.startedAt!),
        });
        logger.info({ exitReason, pnl: session.currentPnl }, "Trade exited");

        if (!session.longTradeUsed || !session.shortTradeUsed) {
          // Allow watching again for the other direction
          session.phase = "watching";
          botState.phase = "watching";
          session.entryPrice = null;
          session.stopPrice = null;
          session.targetPrice = null;
          session.currentPnl = null;
          session.qty = null;
          session.alpacaOrderId = null;
          session.breakoutDirection = null;
        } else {
          session.phase = "closed";
          botState.phase = "closed";
        }
      }
    }

    botState.lastUpdated = new Date().toISOString();
    botState.session = session;
  } catch (err) {
    logger.error({ err }, "Bot loop error");
    botState.error = err instanceof Error ? err.message : String(err);
  }
}

export async function startBot(symbol: string): Promise<void> {
  if (botState.running) return;
  botState.running = true;
  botState.symbol = symbol.toUpperCase();
  botState.phase = "waiting_open";
  botState.startedAt = new Date().toISOString();
  botState.stoppedAt = null;
  botState.error = null;
  botState.session = createEmptySession(symbol.toUpperCase());

  // Run every 30 seconds
  botState.loopTimer = setInterval(async () => {
    await runBotLoop();
  }, 30000);

  // Run immediately
  await runBotLoop();
  logger.info({ symbol }, "Bot started");
}

export async function stopBot(): Promise<void> {
  if (botState.loopTimer) {
    clearInterval(botState.loopTimer);
    botState.loopTimer = null;
  }
  botState.running = false;
  botState.phase = "idle";
  botState.stoppedAt = new Date().toISOString();
  logger.info("Bot stopped");
}

export async function ensureDefaultConfig(): Promise<void> {
  const rows = await db.select().from(botConfigTable).limit(1);
  if (rows.length === 0) {
    await db.insert(botConfigTable).values({});
  }
}
