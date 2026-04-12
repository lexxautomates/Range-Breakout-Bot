import { alpaca, apiKey, apiSecret, dataBaseUrl } from "./alpaca.js";
import {
  registry,
  botState,
  createEmptySession,
  type ChildBotState,
  type ChildBotConfig,
  type BotPhase,
} from "./botState.js";
import { db } from "@workspace/db";
import { tradesTable, botConfigTable, botInstancesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Time helpers ────────────────────────────────────────────────────────────

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

// ─── Alpaca helpers ───────────────────────────────────────────────────────────

export async function fetchBars(
  symbol: string,
  timeframe: string,
  limit: number,
): Promise<Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>> {
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

export async function fetchLatestQuote(symbol: string): Promise<number | null> {
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

async function placeMarketOrder(
  symbol: string,
  side: "buy" | "sell",
  qty: number,
): Promise<string | null> {
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

// ─── DB config ────────────────────────────────────────────────────────────────

export async function getGlobalConfig() {
  const rows = await db.select().from(botConfigTable).limit(1);
  if (rows.length === 0) {
    const [cfg] = await db.insert(botConfigTable).values({}).returning();
    return cfg!;
  }
  return rows[0]!;
}

export async function ensureDefaultConfig(): Promise<void> {
  const rows = await db.select().from(botConfigTable).limit(1);
  if (rows.length === 0) {
    await db.insert(botConfigTable).values({});
  }
}

// ─── Self-evolution (per-parameter impact tracking) ─────────────────────────
//
// Strategy: parameter impact analysis via before/after R-multiple comparison.
//
// Each evolution cycle:
// 1. Record the avgRMultiple immediately before mutation ("baseline").
// 2. Apply the mutation (change one parameter in one direction).
// 3. On the NEXT evolution cycle, compare current avgRMultiple to the baseline:
//    - If avgRMultiple improved → the parameter change was beneficial → continue
//      in the same direction (or pick a different param to explore further).
//    - If avgRMultiple degraded → the change hurt performance → reverse direction
//      for the same parameter to undo and search further.
// This implements A/B testing of individual parameters over time.

// Evolvable numeric parameters and their safe min/max bounds
const EVOLVABLE_PARAMS: Array<{
  key: keyof ChildBotConfig;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "openingRangeMinutes", min: 5, max: 60, step: 5 },
  { key: "rewardRiskRatio", min: 1.0, max: 5.0, step: 0.25 },
  { key: "volumeMultiplier", min: 0.5, max: 5.0, step: 0.25 },
  { key: "maxOrbWidthPercent", min: 0.5, max: 10.0, step: 0.5 },
  { key: "minOrbWidthPercent", min: 0.01, max: 1.0, step: 0.05 },
  { key: "breakoutWindowMinutes", min: 30, max: 390, step: 30 },
];

// Per-bot mutation state for impact tracking
interface MutationRecord {
  paramKey: string;
  direction: 1 | -1;
  baselineAvgR: number;  // avgRMultiple BEFORE this mutation was applied
}

const lastMutation = new Map<string, MutationRecord>();

function mutateConfig(
  botId: string,
  config: ChildBotConfig,
  currentAvgR: number,
): { config: ChildBotConfig; mutatedKey: string; direction: 1 | -1 } {
  const prev = lastMutation.get(botId);

  let paramKey: string;
  let direction: 1 | -1;

  if (prev) {
    // Compare current avgR to baseline to evaluate the previous mutation's impact
    const improved = currentAvgR > prev.baselineAvgR;

    // If improved: with 75% probability keep same param/direction (exploit success);
    //   with 25% probability explore a new parameter.
    // If degraded: always reverse the previous direction for the same parameter
    //   (undo what hurt performance) with 75% probability, or explore new param with 25%.
    if (improved) {
      if (Math.random() < 0.75) {
        paramKey = prev.paramKey;
        direction = prev.direction; // keep going in the profitable direction
      } else {
        paramKey = EVOLVABLE_PARAMS[Math.floor(Math.random() * EVOLVABLE_PARAMS.length)]!.key as string;
        direction = Math.random() > 0.5 ? 1 : -1;
      }
    } else {
      if (Math.random() < 0.75) {
        paramKey = prev.paramKey;
        direction = (-prev.direction) as 1 | -1; // reverse to undo harmful change
      } else {
        paramKey = EVOLVABLE_PARAMS[Math.floor(Math.random() * EVOLVABLE_PARAMS.length)]!.key as string;
        direction = Math.random() > 0.5 ? 1 : -1;
      }
    }
  } else {
    // First evolution: pick a random parameter and direction
    const param = EVOLVABLE_PARAMS[Math.floor(Math.random() * EVOLVABLE_PARAMS.length)]!;
    paramKey = param.key as string;
    direction = Math.random() > 0.5 ? 1 : -1;
  }

  const paramDef = EVOLVABLE_PARAMS.find((p) => p.key === paramKey)!;
  const current = config[paramKey as keyof ChildBotConfig] as number;
  const newVal = Math.min(
    paramDef.max,
    Math.max(paramDef.min, current + direction * paramDef.step),
  );

  const isInt = paramKey.includes("Minutes");
  const finalVal = isInt ? Math.round(newVal) : parseFloat(newVal.toFixed(4));

  // Record this mutation with the current avgR as the new baseline
  lastMutation.set(botId, { paramKey, direction, baselineAvgR: currentAvgR });

  const newConfig = { ...config, [paramKey]: finalVal };
  return { config: newConfig, mutatedKey: paramKey, direction };
}

async function maybeEvolve(bot: ChildBotState, evolutionThreshold: number): Promise<void> {
  if (bot.totalTrades < evolutionThreshold) return;
  if (bot.totalTrades % evolutionThreshold !== 0) return;

  const { config: newConfig, mutatedKey, direction } = mutateConfig(
    bot.id,
    bot.config,
    bot.avgRMultiple,
  );

  const oldVal = bot.config[mutatedKey as keyof ChildBotConfig];
  const newVal = newConfig[mutatedKey as keyof ChildBotConfig];

  bot.config = newConfig;
  bot.generation += 1;

  const prevRecord = lastMutation.get(bot.id);
  logger.info(
    {
      botId: bot.id,
      symbol: bot.symbol,
      generation: bot.generation,
      mutatedKey,
      oldVal,
      newVal,
      direction,
      baselineAvgR: prevRecord?.baselineAvgR.toFixed(3) ?? "n/a",
      currentAvgR: bot.avgRMultiple.toFixed(3),
    },
    "Bot evolved — parameter impact analysis",
  );

  if (bot.dbId) {
    await db
      .update(botInstancesTable)
      .set({
        generation: bot.generation,
        configSnapshot: newConfig as Record<string, unknown>,
        avgRMultiple: bot.avgRMultiple,
        totalTrades: bot.totalTrades,
      })
      .where(eq(botInstancesTable.id, bot.dbId));
  }
}

// ─── Record trade ──────────────────────────────────────────────────────────────

async function recordTrade(
  bot: ChildBotState,
  params: {
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
  },
  evolutionThreshold: number,
): Promise<void> {
  const { direction, entryPrice, exitPrice, stopPrice, qty } = params;
  const pricePnl = direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pnl = pricePnl * qty;
  const riskPerShare = Math.abs(entryPrice - stopPrice);
  const rMultiple = riskPerShare > 0 ? pricePnl / riskPerShare : 0;
  const outcome: "win" | "loss" | "breakeven" =
    pnl > 0.01 ? "win" : pnl < -0.01 ? "loss" : "breakeven";
  const date = params.entryTime.toISOString().split("T")[0]!;

  await db.insert(tradesTable).values({
    symbol: bot.symbol,
    botInstanceId: bot.dbId,
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
    orbHigh: params.orbHigh,
    orbLow: params.orbLow,
    volumeRatio: params.volumeRatio,
    date,
  });

  // Update performance metrics
  bot.totalTrades += 1;
  bot.totalPnl += pnl;
  if (outcome === "win") bot.wins += 1;
  if (outcome === "loss") bot.losses += 1;
  bot.recentRMultiples.push(rMultiple);
  if (bot.recentRMultiples.length > 20) bot.recentRMultiples.shift();
  bot.avgRMultiple =
    bot.recentRMultiples.reduce((a, b) => a + b, 0) / bot.recentRMultiples.length;

  await maybeEvolve(bot, evolutionThreshold);

  if (bot.dbId) {
    await db
      .update(botInstancesTable)
      .set({ avgRMultiple: bot.avgRMultiple, totalTrades: bot.totalTrades })
      .where(eq(botInstancesTable.id, bot.dbId));
  }
}

// ─── Core bot loop ─────────────────────────────────────────────────────────────

async function runChildBotLoop(bot: ChildBotState, evolutionThreshold: number): Promise<void> {
  const session = bot.session;
  const config = bot.config;
  const et = getEasternTime();

  try {
    const minsAfterOpen = getMinutesAfterOpen(et);
    const inMarket = isMarketHours(et);

    if (!inMarket) {
      if (minsAfterOpen >= 0) {
        if (session.phase === "in_trade") {
          await closePosition(session.symbol);
          if (session.currentPrice && session.entryPrice && session.qty) {
            await recordTrade(
              bot,
              {
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
                entryTime: new Date(bot.startedAt),
              },
              evolutionThreshold,
            );
          }
        }
        session.phase = "closed";
      }
      bot.lastUpdated = new Date().toISOString();
      return;
    }

    const price = await fetchLatestQuote(session.symbol);
    if (price) session.currentPrice = price;

    if (session.phase === "waiting_open") {
      if (minsAfterOpen >= 0) {
        session.phase = "building_range";
        session.openRangeStart = et.toISOString();
      }
    } else if (session.phase === "building_range") {
      if (minsAfterOpen < config.openingRangeMinutes) {
        const bars = await fetchBars(session.symbol, "1Min", config.openingRangeMinutes + 2);
        const todayBars = bars.filter((b) => {
          const bt = new Date(b.t);
          return (
            getMinutesAfterOpen(
              new Date(bt.toLocaleString("en-US", { timeZone: "America/New_York" })),
            ) >= 0
          );
        });
        if (todayBars.length > 0) {
          session.orbHigh = Math.max(...todayBars.map((b) => b.h));
          session.orbLow = Math.min(...todayBars.map((b) => b.l));
          session.orbWidth = session.orbHigh - session.orbLow;
          session.volume = todayBars.reduce((sum, b) => sum + b.v, 0);
        }
      } else {
        session.openRangeEnd = et.toISOString();
        session.averageVolume = await getAverageVolume(session.symbol);

        if (session.orbHigh && session.orbLow && price) {
          const orbWidth = session.orbHigh - session.orbLow;
          const widthPct = (orbWidth / price) * 100;
          if (widthPct > config.maxOrbWidthPercent || widthPct < config.minOrbWidthPercent) {
            logger.info({ botId: bot.id, widthPct, symbol: bot.symbol }, "ORB width filter — skipping");
            session.phase = "closed";
          } else {
            session.phase = "watching";
          }
        } else {
          session.phase = "watching";
        }
      }
    } else if (session.phase === "watching") {
      const breakoutDeadline = config.openingRangeMinutes + config.breakoutWindowMinutes;
      if (minsAfterOpen > breakoutDeadline) {
        session.phase = "closed";
        bot.lastUpdated = new Date().toISOString();
        return;
      }

      if (!session.orbHigh || !session.orbLow || !price) return;

      let volOk = true;
      if (config.requireVolumeConfirmation && session.averageVolume && session.averageVolume > 0) {
        const bars = await fetchBars(session.symbol, "1Min", 2);
        const latestVol = bars[bars.length - 1]?.v ?? 0;
        session.volume = latestVol;
        session.volumeRatio = latestVol / (session.averageVolume / 390);
        volOk = session.volumeRatio >= config.volumeMultiplier;
      }

      const canLong = !session.longTradeUsed || config.reEntryEnabled;
      const canShort = !session.shortTradeUsed || config.reEntryEnabled;

      if (price > session.orbHigh && canLong && volOk) {
        const stopPrice = config.useModerateRisk
          ? (session.orbHigh + session.orbLow) / 2
          : session.orbLow;
        const riskPerShare = price - stopPrice;
        const targetPrice = price + riskPerShare * config.rewardRiskRatio;

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
          session.longTradeUsed = true;
          logger.info({ botId: bot.id, symbol: bot.symbol, price, stopPrice, targetPrice, qty }, "Long breakout entry");
        }
      } else if (price < session.orbLow && canShort && volOk) {
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
          session.shortTradeUsed = true;
          logger.info({ botId: bot.id, symbol: bot.symbol, price, stopPrice, targetPrice, qty }, "Short breakout entry");
        }
      }
    } else if (session.phase === "in_trade") {
      if (!price || !session.entryPrice || !session.stopPrice || !session.targetPrice || !session.qty)
        return;

      const direction = session.breakoutDirection as "long" | "short";
      const pricePnl =
        direction === "long"
          ? price - session.entryPrice
          : session.entryPrice - price;
      session.currentPnl = pricePnl * session.qty;

      const riskPerShare = Math.abs(session.entryPrice - session.stopPrice);
      const currentR = riskPerShare > 0 ? pricePnl / riskPerShare : 0;

      let exitReason: string | null = null;

      if (direction === "long" && price <= session.stopPrice) exitReason = "stop_loss";
      else if (direction === "short" && price >= session.stopPrice) exitReason = "stop_loss";

      if (!exitReason && direction === "long" && price >= session.targetPrice) exitReason = "take_profit";
      else if (!exitReason && direction === "short" && price <= session.targetPrice) exitReason = "take_profit";

      if (!exitReason && session.orbHigh && session.orbLow) {
        if (price < session.orbHigh && price > session.orbLow) {
          exitReason = "re_entered_range";
        }
      }

      if (!exitReason && config.trailingStopEnabled && currentR >= config.trailingStopActivationR) {
        const trailStop =
          direction === "long" ? price - riskPerShare : price + riskPerShare;
        if (direction === "long" && trailStop > session.stopPrice) {
          session.stopPrice = trailStop;
        } else if (direction === "short" && trailStop < session.stopPrice) {
          session.stopPrice = trailStop;
        }
      }

      if (exitReason) {
        await closePosition(session.symbol);
        await recordTrade(
          bot,
          {
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
            entryTime: new Date(bot.startedAt),
          },
          evolutionThreshold,
        );
        logger.info({ botId: bot.id, symbol: bot.symbol, exitReason, pnl: session.currentPnl }, "Trade exited");

        if (!session.longTradeUsed || !session.shortTradeUsed) {
          session.phase = "watching";
          session.entryPrice = null;
          session.stopPrice = null;
          session.targetPrice = null;
          session.currentPnl = null;
          session.qty = null;
          session.alpacaOrderId = null;
          session.breakoutDirection = null;
        } else {
          session.phase = "closed";
        }
      }
    }

    bot.lastUpdated = new Date().toISOString();
    bot.session = session;
  } catch (err) {
    logger.error({ err, botId: bot.id, symbol: bot.symbol }, "Child bot loop error");
    bot.error = err instanceof Error ? err.message : String(err);
  }
}

// ─── Public API: multi-bot ────────────────────────────────────────────────────

export async function startChildBot(
  symbol: string,
  configOverride?: Partial<ChildBotConfig>,
  parentId?: string,
  parentDbId?: number | null,
  parentGeneration?: number,
): Promise<ChildBotState> {
  const sym = symbol.toUpperCase();
  const globalConfig = await getGlobalConfig();

  const baseConfig: ChildBotConfig = {
    openingRangeMinutes: globalConfig.openingRangeMinutes,
    riskPercent: globalConfig.riskPercent,
    rewardRiskRatio: globalConfig.rewardRiskRatio,
    requireVolumeConfirmation: globalConfig.requireVolumeConfirmation,
    volumeMultiplier: globalConfig.volumeMultiplier,
    trailingStopEnabled: globalConfig.trailingStopEnabled,
    trailingStopActivationR: globalConfig.trailingStopActivationR,
    reEntryEnabled: globalConfig.reEntryEnabled,
    maxOrbWidthPercent: globalConfig.maxOrbWidthPercent,
    minOrbWidthPercent: globalConfig.minOrbWidthPercent,
    breakoutWindowMinutes: globalConfig.breakoutWindowMinutes,
    useModerateRisk: globalConfig.useModerateRisk,
  };

  const config: ChildBotConfig = { ...baseConfig, ...configOverride };
  const generation = parentGeneration != null ? parentGeneration + 1 : 0;
  const botId = `${sym}-${registry.nextId++}`;

  const [dbRow] = await db
    .insert(botInstancesTable)
    .values({
      symbol: sym,
      generation,
      parentId: parentDbId ?? null,
      configSnapshot: config as Record<string, unknown>,
    })
    .returning();

  const bot: ChildBotState = {
    id: botId,
    dbId: dbRow?.id ?? null,
    symbol: sym,
    generation,
    parentId: parentId ?? null,
    config,
    session: createEmptySession(sym),
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    lastUpdated: null,
    error: null,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    totalPnl: 0,
    avgRMultiple: 0,
    recentRMultiples: [],
    loopTimer: null,
  };

  registry.bots.set(botId, bot);

  const evolutionThreshold = globalConfig.evolutionThreshold ?? 5;

  await runChildBotLoop(bot, evolutionThreshold);
  bot.loopTimer = setInterval(async () => {
    const fresh = await getGlobalConfig();
    await runChildBotLoop(bot, fresh.evolutionThreshold ?? 5);
  }, 30000);

  logger.info({ botId, symbol: sym, parentId, generation }, "Child bot started");
  return bot;
}

export async function stopChildBot(botId: string): Promise<boolean> {
  const bot = registry.bots.get(botId);
  if (!bot) return false;

  if (bot.loopTimer) {
    clearInterval(bot.loopTimer);
    bot.loopTimer = null;
  }
  bot.stoppedAt = new Date().toISOString();

  if (bot.session.phase === "in_trade") {
    await closePosition(bot.symbol);
  }

  if (bot.dbId) {
    await db
      .update(botInstancesTable)
      .set({ stoppedAt: new Date() })
      .where(eq(botInstancesTable.id, bot.dbId));
  }

  lastMutation.delete(botId);
  registry.bots.delete(botId);
  logger.info({ botId, symbol: bot.symbol }, "Child bot stopped");
  return true;
}

export async function stopAllChildBots(): Promise<void> {
  const ids = Array.from(registry.bots.keys());
  for (const id of ids) {
    await stopChildBot(id);
  }
}

export function listChildBots(): ChildBotState[] {
  return Array.from(registry.bots.values());
}

export function getChildBot(botId: string): ChildBotState | undefined {
  return registry.bots.get(botId);
}

// ─── Offspring spawning ────────────────────────────────────────────────────────

export async function spawnOffspring(parentBotId: string): Promise<ChildBotState | null> {
  const parent = registry.bots.get(parentBotId);
  if (!parent) return null;

  const { config: mutatedConfig } = mutateConfig(
    `${parentBotId}-offspring`,
    parent.config,
    parent.avgRMultiple,
  );

  const offspring = await startChildBot(
    parent.symbol,
    mutatedConfig,
    parentBotId,
    parent.dbId,
    parent.generation,
  );

  logger.info(
    { parentBotId, offspringId: offspring.id, symbol: parent.symbol, generation: offspring.generation },
    "Offspring spawned",
  );
  return offspring;
}

// ─── Legacy single-bot API (backward compat) ─────────────────────────────────

let legacyBotId: string | null = null;

export async function startBot(symbol: string): Promise<void> {
  if (botState.running) return;

  const bot = await startChildBot(symbol);
  legacyBotId = bot.id;

  botState.running = true;
  botState.symbol = symbol.toUpperCase();
  botState.phase = bot.session.phase;
  botState.startedAt = bot.startedAt;
  botState.stoppedAt = null;
  botState.error = null;
  botState.session = bot.session;

  botState.loopTimer = setInterval(() => {
    if (legacyBotId) {
      const b = registry.bots.get(legacyBotId);
      if (b) {
        botState.phase = b.session.phase as BotPhase;
        botState.lastUpdated = b.lastUpdated;
        botState.error = b.error;
        botState.session = b.session;
      }
    }
  }, 5000);

  logger.info({ symbol }, "Bot started (legacy compat)");
}

export async function stopBot(): Promise<void> {
  if (botState.loopTimer) {
    clearInterval(botState.loopTimer);
    botState.loopTimer = null;
  }

  if (legacyBotId) {
    await stopChildBot(legacyBotId);
    legacyBotId = null;
  }

  botState.running = false;
  botState.phase = "idle";
  botState.stoppedAt = new Date().toISOString();
  logger.info("Bot stopped (legacy compat)");
}

export async function runBotLoop(): Promise<void> {
  if (!legacyBotId) return;
  const bot = registry.bots.get(legacyBotId);
  if (!bot) return;
  const cfg = await getGlobalConfig();
  await runChildBotLoop(bot, cfg.evolutionThreshold ?? 5);
}
