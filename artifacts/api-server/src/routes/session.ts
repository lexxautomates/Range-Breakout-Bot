import { Router } from "express";
import { botState } from "../lib/botState.js";
import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/session/current", (req, res) => {
  const today = new Date().toISOString().split("T")[0]!;
  if (!botState.session) {
    res.json({
      symbol: botState.symbol || "",
      phase: "idle",
      date: today,
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
    });
    return;
  }

  const s = botState.session;
  res.json({
    symbol: s.symbol,
    phase: s.phase,
    date: s.date,
    orbHigh: s.orbHigh,
    orbLow: s.orbLow,
    orbWidth: s.orbWidth,
    currentPrice: s.currentPrice,
    volume: s.volume,
    averageVolume: s.averageVolume,
    volumeRatio: s.volumeRatio,
    openRangeStart: s.openRangeStart,
    openRangeEnd: s.openRangeEnd,
    breakoutDirection: s.breakoutDirection,
    entryPrice: s.entryPrice,
    stopPrice: s.stopPrice,
    targetPrice: s.targetPrice,
    currentPnl: s.currentPnl,
    longTradeUsed: s.longTradeUsed,
    shortTradeUsed: s.shortTradeUsed,
  });
});

router.get("/session/summary", async (req, res) => {
  const today = new Date().toISOString().split("T")[0]!;

  const rows = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.date, today));

  const wins = rows.filter((r) => r.outcome === "win").length;
  const losses = rows.filter((r) => r.outcome === "loss").length;
  const totalPnl = rows.reduce((sum, r) => sum + r.pnl, 0);
  const winRate = rows.length > 0 ? wins / rows.length : 0;
  const pnls = rows.map((r) => r.pnl);
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : null;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : null;

  res.json({
    date: today,
    totalTrades: rows.length,
    wins,
    losses,
    totalPnl,
    winRate,
    bestTrade,
    worstTrade,
  });
});

export default router;
