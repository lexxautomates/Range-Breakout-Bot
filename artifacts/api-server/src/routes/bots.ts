import { Router } from "express";
import {
  startChildBot,
  stopChildBot,
  stopAllChildBots,
  listChildBots,
  getChildBot,
  spawnOffspring,
} from "../lib/botEngine.js";

const router = Router();

// GET /bots — list all running child bots
router.get("/bots", (_req, res) => {
  const bots = listChildBots().map(serializeBot);
  res.json(bots);
});

// POST /bots — start a new child bot for a symbol
router.post("/bots", async (req, res) => {
  const { symbol, config } = req.body ?? {};
  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  try {
    const bot = await startChildBot(symbol, config ?? {});
    res.json(serializeBot(bot));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /bots — stop all child bots
router.delete("/bots", async (_req, res) => {
  await stopAllChildBots();
  res.json({ ok: true });
});

// GET /bots/:id — get a single child bot
router.get("/bots/:id", (req, res) => {
  const bot = getChildBot(req.params.id!);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json(serializeBot(bot));
});

// DELETE /bots/:id — stop a single child bot
router.delete("/bots/:id", async (req, res) => {
  const ok = await stopChildBot(req.params.id!);
  if (!ok) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json({ ok: true });
});

// POST /bots/:id/offspring — spawn an evolved copy of a bot
router.post("/bots/:id/offspring", async (req, res) => {
  const offspring = await spawnOffspring(req.params.id!);
  if (!offspring) {
    res.status(404).json({ error: "Parent bot not found" });
    return;
  }
  res.json(serializeBot(offspring));
});

function serializeBot(bot: ReturnType<typeof getChildBot>) {
  if (!bot) return null;
  return {
    id: bot.id,
    dbId: bot.dbId,
    symbol: bot.symbol,
    generation: bot.generation,
    parentId: bot.parentId,
    config: bot.config,
    phase: bot.session.phase,
    session: {
      symbol: bot.session.symbol,
      phase: bot.session.phase,
      date: bot.session.date,
      orbHigh: bot.session.orbHigh,
      orbLow: bot.session.orbLow,
      orbWidth: bot.session.orbWidth,
      currentPrice: bot.session.currentPrice,
      volume: bot.session.volume,
      averageVolume: bot.session.averageVolume,
      volumeRatio: bot.session.volumeRatio,
      openRangeStart: bot.session.openRangeStart,
      openRangeEnd: bot.session.openRangeEnd,
      breakoutDirection: bot.session.breakoutDirection,
      entryPrice: bot.session.entryPrice,
      stopPrice: bot.session.stopPrice,
      targetPrice: bot.session.targetPrice,
      currentPnl: bot.session.currentPnl,
      longTradeUsed: bot.session.longTradeUsed,
      shortTradeUsed: bot.session.shortTradeUsed,
      qty: bot.session.qty,
    },
    startedAt: bot.startedAt,
    stoppedAt: bot.stoppedAt,
    lastUpdated: bot.lastUpdated,
    error: bot.error,
    stats: {
      totalTrades: bot.totalTrades,
      wins: bot.wins,
      losses: bot.losses,
      totalPnl: bot.totalPnl,
      avgRMultiple: bot.avgRMultiple,
      winRate: bot.totalTrades > 0 ? bot.wins / bot.totalTrades : 0,
    },
  };
}

export default router;
