import { Router } from "express";
import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db";
import { desc, count, sql } from "drizzle-orm";
import { ListTradesQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/trades", async (req, res) => {
  const parsed = ListTradesQueryParams.safeParse({
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });

  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;

  const [rows, totalRows] = await Promise.all([
    db.select().from(tradesTable).orderBy(desc(tradesTable.entryTime)).limit(limit).offset(offset),
    db.select({ count: count() }).from(tradesTable),
  ]);

  res.json({
    trades: rows.map((r) => ({
      ...r,
      entryTime: r.entryTime.toISOString(),
      exitTime: r.exitTime.toISOString(),
    })),
    total: totalRows[0]?.count ?? 0,
  });
});

router.get("/trades/stats", async (_req, res) => {
  const rows = await db.select().from(tradesTable);

  if (rows.length === 0) {
    res.json({
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnl: 0,
      avgPnlPerTrade: 0,
      avgRMultiple: 0,
      bestTrade: 0,
      worstTrade: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
    });
    return;
  }

  const wins = rows.filter((r) => r.outcome === "win");
  const losses = rows.filter((r) => r.outcome === "loss");
  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);
  const pnls = rows.map((r) => r.pnl);
  const grossWin = wins.reduce((s, r) => s + r.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r.pnl, 0));

  res.json({
    totalTrades: rows.length,
    wins: wins.length,
    losses: losses.length,
    winRate: rows.length > 0 ? wins.length / rows.length : 0,
    totalPnl,
    avgPnlPerTrade: totalPnl / rows.length,
    avgRMultiple: rows.reduce((s, r) => s + r.rMultiple, 0) / rows.length,
    bestTrade: Math.max(...pnls),
    worstTrade: Math.min(...pnls),
    avgWin: wins.length > 0 ? grossWin / wins.length : 0,
    avgLoss: losses.length > 0 ? -(grossLoss / losses.length) : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : 0,
  });
});

export default router;
