import { Router } from "express";
import { alpaca, apiKey, apiSecret, dataBaseUrl } from "../lib/alpaca.js";

const router = Router();

router.get("/account", async (_req, res) => {
  const acct = await alpaca.getAccount() as {
    equity: string;
    cash: string;
    buying_power: string;
    portfolio_value: string;
    daytrade_count: number;
    pattern_day_trader: boolean;
  };

  res.json({
    equity: parseFloat(acct.equity),
    cash: parseFloat(acct.cash),
    buyingPower: parseFloat(acct.buying_power),
    portfolioValue: parseFloat(acct.portfolio_value),
    daytradeCount: acct.daytrade_count,
    patternDayTrader: acct.pattern_day_trader,
    unrealizedPnl: null,
    realizedPnl: null,
  });
});

router.get("/account/positions", async (_req, res) => {
  const positions = await alpaca.getPositions() as Array<{
    symbol: string;
    qty: string;
    side: string;
    avg_entry_price: string;
    current_price: string;
    market_value: string;
    unrealized_pl: string;
    unrealized_plpc: string;
  }>;

  res.json(
    positions.map((p) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      side: p.side as "long" | "short",
      entryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      unrealizedPnl: parseFloat(p.unrealized_pl),
      unrealizedPnlPercent: parseFloat(p.unrealized_plpc) * 100,
    }))
  );
});

export default router;
