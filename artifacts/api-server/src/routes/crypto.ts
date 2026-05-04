import { Router } from "express";
import { CryptoDotComClient } from "../lib/cryptocom.js";
import {
  startCryptoBot,
  stopCryptoBot,
  getCryptoBots,
  getCryptoBot,
  DEFAULT_CRYPTO_BOT_CONFIG,
  type CryptoBotConfig as CryptoBotConfigType,
} from "../lib/cryptoBotEngine.js";
import { db } from "@workspace/db";
import { cryptoBotConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { LlmConfig } from "../lib/llmAdvisor.js";

const router = Router();

type ClientReq = {
  headers: Record<string, unknown>;
};

function getClient(req: ClientReq): CryptoDotComClient {
  // IMPORTANT: do not accept credentials via query string; it leaks to logs/proxies.
  const apiKey =
    (req.headers["x-cryptocom-api-key"] as string) || process.env.CRYPTOCOM_API_KEY || "";
  const apiSecret =
    (req.headers["x-cryptocom-api-secret"] as string) ||
    process.env.CRYPTOCOM_API_SECRET ||
    "";
  return new CryptoDotComClient(apiKey, apiSecret);
}

// ─── Public Market Data ───────────────────────────────────────────────────────

router.get("/crypto/instruments", async (req, res) => {
  const client = getClient(req as never);
  const type = req.query["type"] as "SPOT" | "PERPETUAL" | undefined;
  try {
    const instruments = await client.getInstruments(type ?? "SPOT");
    res.json({ instruments, count: instruments.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/tickers", async (req, res) => {
  const client = getClient(req as never);
  const instrument = req.query["instrument"] as string | undefined;
  try {
    const tickers = await client.getTickers(instrument);
    res.json({ tickers, count: tickers.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/ticker/:instrument", async (req, res) => {
  const client = getClient(req as never);
  try {
    const ticker = await client.getTicker(req.params["instrument"]!);
    if (!ticker) {
      res.status(404).json({ error: "Ticker not found" });
      return;
    }
    res.json(ticker);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/book/:instrument", async (req, res) => {
  const client = getClient(req as never);
  const depth = Number(req.query["depth"] ?? 10);
  try {
    const book = await client.getOrderBook(req.params["instrument"]!, depth);
    if (!book) {
      res.status(404).json({ error: "Order book not found" });
      return;
    }
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/candles/:instrument", async (req, res) => {
  const client = getClient(req as never);
  const interval = (req.query["interval"] as string) ?? "1m";
  const count = Number(req.query["count"] ?? 100);
  try {
    const candles = await client.getCandlesticks(
      req.params["instrument"]!,
      interval as never,
      count,
    );
    res.json({ candles, count: candles.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/trades/:instrument", async (req, res) => {
  const client = getClient(req as never);
  const count = Number(req.query["count"] ?? 25);
  try {
    const trades = await client.getPublicTrades(req.params["instrument"]!, count);
    res.json({ trades, count: trades.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Private Account ─────────────────────────────────────────────────────────

router.get("/crypto/account", async (req, res) => {
  const client = getClient(req as never);
  try {
    const balances = await client.getUserBalance();
    const accounts = await client.getAccounts().catch(() => []);
    res.json({ balances, accounts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/positions", async (req, res) => {
  const client = getClient(req as never);
  const instrument = req.query["instrument"] as string | undefined;
  try {
    const positions = await client.getPositions(instrument);
    res.json({ positions, count: positions.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/orders/open", async (req, res) => {
  const client = getClient(req as never);
  const instrument = req.query["instrument"] as string | undefined;
  try {
    const orders = await client.getOpenOrders(instrument);
    res.json({ orders, count: orders.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/orders/history", async (req, res) => {
  const client = getClient(req as never);
  const instrument = req.query["instrument"] as string | undefined;
  const limit = Number(req.query["limit"] ?? 20);
  try {
    const orders = await client.getOrderHistory(instrument, undefined, undefined, limit);
    res.json({ orders, count: orders.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/crypto/orders/market", async (req, res) => {
  const client = getClient(req as never);
  const { instrument, side, quantity } = req.body ?? {};
  if (!instrument || !side || !quantity) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    const orderId = await client.createMarketOrder(
      instrument,
      side,
      Number(quantity),
    );
    res.json({ orderId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/crypto/orders/limit", async (req, res) => {
  const client = getClient(req as never);
  const { instrument, side, quantity, price } = req.body ?? {};
  if (!instrument || !side || !quantity || !price) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    const orderId = await client.createLimitOrder(
      instrument,
      side,
      Number(quantity),
      Number(price),
    );
    res.json({ orderId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/crypto/orders/stop-loss", async (req, res) => {
  const client = getClient(req as never);
  const { instrument, side, quantity, trigger_price } = req.body ?? {};
  if (!instrument || !side || !quantity || !trigger_price) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    const orderId = await client.createStopLossOrder(
      instrument,
      side,
      Number(quantity),
      Number(trigger_price),
    );
    res.json({ orderId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/crypto/orders/take-profit", async (req, res) => {
  const client = getClient(req as never);
  const { instrument, side, quantity, trigger_price } = req.body ?? {};
  if (!instrument || !side || !quantity || !trigger_price) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    const orderId = await client.createTakeProfitOrder(
      instrument,
      side,
      Number(quantity),
      Number(trigger_price),
    );
    res.json({ orderId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/crypto/orders/:orderId", async (req, res) => {
  const client = getClient(req as never);
  const instrument = req.query["instrument"] as string;
  if (!instrument) {
    res.status(400).json({ error: "Missing instrument query param" });
    return;
  }
  try {
    const ok = await client.cancelOrder(instrument, req.params["orderId"]!);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/crypto/orders", async (req, res) => {
  const client = getClient(req as never);
  const instrument = req.query["instrument"] as string | undefined;
  try {
    const ok = await client.cancelAllOrders(instrument);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/crypto/positions/:instrument/close", async (req, res) => {
  const client = getClient(req as never);
  const { order_type, price } = req.body ?? {};
  try {
    const orderId = await client.closePosition(
      req.params["instrument"]!,
      order_type ?? "MARKET",
      price ? Number(price) : undefined,
    );
    res.json({ orderId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/crypto/fee-rate", async (req, res) => {
  const client = getClient(req as never);
  try {
    const feeRate = await client.getFeeRate();
    res.json(feeRate);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Crypto Bot Management ───────────────────────────────────────────────────

router.get("/crypto/bots", (_req, res) => {
  const bots = getCryptoBots();
  res.json(bots);
});

router.get("/crypto/bots/:id", (req, res) => {
  const bot = getCryptoBot(req.params["id"]!);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json(bot);
});

router.post("/crypto/bots/start", async (req, res) => {
  const body = req.body ?? {};
  const config: CryptoBotConfigType = {
    ...DEFAULT_CRYPTO_BOT_CONFIG,
    ...body,
  };

  const apiKey =
    (req.headers["x-cryptocom-api-key"] as string) ||
    process.env.CRYPTOCOM_API_KEY ||
    "";
  const apiSecret =
    (req.headers["x-cryptocom-api-secret"] as string) ||
    process.env.CRYPTOCOM_API_SECRET ||
    "";

  const client = new CryptoDotComClient(apiKey, apiSecret);

  const llmConfig: LlmConfig = {
    provider: body.llmProvider ?? "none",
    model: body.llmModel ?? "",
    apiKey: body.llmApiKey ?? "",
    baseUrl: body.llmBaseUrl ?? "",
    temperature: body.llmTemperature ?? 0.2,
    confidenceThreshold: body.llmConfidenceThreshold ?? 0.6,
  };

  try {
    const state = startCryptoBot({ config, client, llmConfig });

    await db
      .insert(cryptoBotConfigsTable)
      .values({
        symbol: config.symbol,
        sessionWindowMinutes: config.sessionWindowMinutes,
        sessionType: config.sessionType,
        riskPercent: config.riskPercent,
        rewardRiskRatio: config.rewardRiskRatio,
        requireVolumeConfirmation: config.requireVolumeConfirmation,
        volumeMultiplier: config.volumeMultiplier,
        trailingStopEnabled: config.trailingStopEnabled,
        trailingStopActivationR: config.trailingStopActivationR,
        reEntryEnabled: config.reEntryEnabled,
        maxOrbWidthPercent: config.maxOrbWidthPercent,
        minOrbWidthPercent: config.minOrbWidthPercent,
        breakoutWindowMinutes: config.breakoutWindowMinutes,
        enableShorts: config.enableShorts,
      })
      .catch((e) => logger.warn({ e }, "Failed to save crypto bot config"));

    res.json(state);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/crypto/bots/:id/stop", (req, res) => {
  const ok = stopCryptoBot(req.params["id"]!);
  if (!ok) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json({ ok: true });
});

router.get("/crypto/bot-configs", async (_req, res) => {
  try {
    const configs = await db
      .select()
      .from(cryptoBotConfigsTable)
      .orderBy(cryptoBotConfigsTable.createdAt);
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
