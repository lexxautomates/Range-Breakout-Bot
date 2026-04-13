/**
 * Crypto.com Exchange v1 REST API client
 * Docs: https://exchange-docs.crypto.com/exchange/v1/rest-ws/index.html
 *
 * Key differences from Spot v2.1:
 *  - Base URL: https://api.crypto.com/exchange/v1  (not /v2)
 *  - All numbers in request/response bodies are double-quoted strings
 *  - Response result lives under result.data (not result directly)
 *  - public/get-ticker → public/get-tickers (plural)
 *  - Richer reason codes
 */

import { createHmac } from "crypto";
import { logger } from "./logger.js";

const BASE_URL = "https://api.crypto.com/exchange/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CryptoInstrument {
  symbol: string;
  inst_type: string;
  display_name: string;
  base_ccy: string;
  quote_ccy: string;
  quote_decimals: number;
  quantity_decimals: number;
  price_tick_size: string;
  qty_tick_size: string;
  max_leverage: string;
  tradable: boolean;
}

export interface CryptoTicker {
  i: string;
  b: string;
  k: string;
  a: string;
  t: number;
  v: string;
  vv: string;
  oi: string;
  c: string;
  h: string;
  l: string;
}

export interface CryptoOrderBook {
  depth: number;
  instrument_name: string;
  bids: Array<[string, string, string]>;
  asks: Array<[string, string, string]>;
  t: number;
}

export interface CryptoCandlestick {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

export interface CryptoTrade {
  d: string;
  s: "BUY" | "SELL";
  p: string;
  q: string;
  t: number;
  i: string;
}

export interface CryptoBalance {
  currency: string;
  balance: string;
  available: string;
  order: string;
  stake: string;
  val: string;
}

export interface CryptoPosition {
  account_id: string;
  quantity: string;
  cost: string;
  open_pos_cost: string;
  open_order_buy: string;
  open_order_sell: string;
  open_order_buy_qty: string;
  open_order_sell_qty: string;
  session_pnl: string;
  total_pnl: string;
  market_value: string;
  leverage: string;
  type: string;
  instrument_name: string;
}

export interface CryptoOrder {
  account_id: string;
  order_id: string;
  client_oid: string;
  order_type: string;
  time_in_force: string;
  side: "BUY" | "SELL";
  exec_inst: string[];
  quantity: string;
  limit_price: string;
  order_value: string;
  maker_fee_rate: string;
  taker_fee_rate: string;
  avg_price: string;
  trigger_price: string;
  ref_price: string;
  cumulative_quantity: string;
  cumulative_value: string;
  cumulative_fee: string;
  status: string;
  update_user_id: string;
  order_date: string;
  instrument_name: string;
  fee_instrument_name: string;
  create_time: number;
  create_time_ns: string;
  update_time: number;
}

export type CandlestickInterval =
  | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "6h" | "12h"
  | "1D" | "7D" | "14D" | "1M";

// ─── Client ───────────────────────────────────────────────────────────────────

export class CryptoDotComClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(apiKey: string, apiSecret: string, baseUrl = BASE_URL) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  // ── Digital Signature ──────────────────────────────────────────────────────
  // SIG = HMAC_SHA256(secret_key, method + id + api_key + param_string + nonce)
  // param_string: sorted param keys → concat key+value

  private buildParamString(params: Record<string, unknown>): string {
    return Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
  }

  private sign(
    method: string,
    id: number,
    params: Record<string, unknown>,
    nonce: number,
  ): string {
    const paramStr = this.buildParamString(params);
    const payload = `${method}${id}${this.apiKey}${paramStr}${nonce}`;
    return createHmac("sha256", this.apiSecret).update(payload).digest("hex");
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private async publicGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const resp = await fetch(url.toString(), {
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) {
      throw new Error(`Crypto.com public API error ${resp.status}: ${await resp.text()}`);
    }
    const json = (await resp.json()) as { code: number; result: T; message?: string };
    if (json.code !== 0) {
      throw new Error(`Crypto.com API code ${json.code}: ${json.message ?? "unknown"}`);
    }
    return json.result;
  }

  private async privatePost<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = Date.now();
    const nonce = Date.now();
    const sig = this.sign(method, id, params, nonce);

    const body = {
      id,
      method,
      params,
      api_key: this.apiKey,
      sig,
      nonce,
    };

    const endpoint = method.startsWith("private/") ? method : `private/${method}`;
    const resp = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`Crypto.com private API error ${resp.status}: ${await resp.text()}`);
    }

    const json = (await resp.json()) as {
      code: number;
      result: T;
      message?: string;
      detail_code?: string;
    };

    if (json.code !== 0) {
      throw new Error(
        `Crypto.com API method=${method} code=${json.code} detail=${json.detail_code ?? ""}: ${json.message ?? "unknown"}`,
      );
    }

    return json.result;
  }

  // ─── Public Market Data ─────────────────────────────────────────────────────

  /** List all tradable instruments (spot + derivatives) */
  async getInstruments(type?: "SPOT" | "PERPETUAL" | "FUTURE" | "OPTION"): Promise<CryptoInstrument[]> {
    const params: Record<string, string> = {};
    if (type) params["instrument_type"] = type;
    const result = await this.publicGet<{ data: CryptoInstrument[] }>(
      "/public/get-instruments",
      params,
    );
    return result.data;
  }

  /** Get tickers for one or all instruments */
  async getTickers(instrument?: string): Promise<CryptoTicker[]> {
    const params: Record<string, string> = {};
    if (instrument) params["instrument_name"] = instrument;
    const result = await this.publicGet<{ data: CryptoTicker[] }>(
      "/public/get-tickers",
      params,
    );
    return result.data ?? [];
  }

  /** Get ticker for a single instrument (returns first match) */
  async getTicker(instrument: string): Promise<CryptoTicker | null> {
    const tickers = await this.getTickers(instrument);
    return tickers[0] ?? null;
  }

  /** Get order book */
  async getOrderBook(instrument: string, depth = 10): Promise<CryptoOrderBook | null> {
    const result = await this.publicGet<{ data: CryptoOrderBook[] }>(
      "/public/get-book",
      { instrument_name: instrument, depth: String(depth) },
    );
    return result.data?.[0] ?? null;
  }

  /** Get candlestick/OHLCV bars */
  async getCandlesticks(
    instrument: string,
    interval: CandlestickInterval = "1m",
    count = 300,
    startTime?: number,
    endTime?: number,
  ): Promise<CryptoCandlestick[]> {
    const params: Record<string, string> = {
      instrument_name: instrument,
      timeframe: interval,
      count: String(count),
    };
    if (startTime) params["start_ts"] = String(startTime);
    if (endTime) params["end_ts"] = String(endTime);

    const result = await this.publicGet<{ data: CryptoCandlestick[] }>(
      "/public/get-candlestick",
      params,
    );
    return result.data ?? [];
  }

  /** Get recent public trades */
  async getPublicTrades(instrument: string, count = 25): Promise<CryptoTrade[]> {
    const result = await this.publicGet<{ data: CryptoTrade[] }>(
      "/public/get-trades",
      { instrument_name: instrument, count: String(count) },
    );
    return result.data ?? [];
  }

  // ─── Private Account ────────────────────────────────────────────────────────

  /** Get unified user balance */
  async getUserBalance(): Promise<CryptoBalance[]> {
    const result = await this.privatePost<{
      data: Array<{ position_balances: CryptoBalance[] }>;
    }>("private/user-balance", {});
    return result.data?.[0]?.position_balances ?? [];
  }

  /** Get spot accounts */
  async getAccounts(currency?: string): Promise<
    Array<{ currency: string; available: string; balance: string; order: string }>
  > {
    const params: Record<string, unknown> = {};
    if (currency) params["currency"] = currency;
    const result = await this.privatePost<{
      data: { accounts: Array<{ currency: string; available: string; balance: string; order: string }> };
    }>("private/get-accounts", params);
    return result.data?.accounts ?? [];
  }

  /** Get open positions */
  async getPositions(instrument?: string): Promise<CryptoPosition[]> {
    const params: Record<string, unknown> = {};
    if (instrument) params["instrument_name"] = instrument;
    const result = await this.privatePost<{ data: CryptoPosition[] }>(
      "private/get-positions",
      params,
    );
    return result.data ?? [];
  }

  // ─── Private Trading ────────────────────────────────────────────────────────

  /**
   * Create a market order (spot)
   * Returns order_id
   */
  async createMarketOrder(
    instrument: string,
    side: "BUY" | "SELL",
    quantity: number,
    clientOid?: string,
  ): Promise<string | null> {
    try {
      const params: Record<string, unknown> = {
        instrument_name: instrument,
        side,
        type: "MARKET",
        quantity: String(quantity),
      };
      if (clientOid) params["client_oid"] = clientOid;

      const result = await this.privatePost<{ order_id: string }>(
        "private/create-order",
        params,
      );
      return result.order_id ?? null;
    } catch (err) {
      logger.error({ err, instrument, side }, "Crypto.com createMarketOrder failed");
      return null;
    }
  }

  /**
   * Create a limit order
   */
  async createLimitOrder(
    instrument: string,
    side: "BUY" | "SELL",
    quantity: number,
    price: number,
    timeInForce: "GOOD_TILL_CANCEL" | "FILL_OR_KILL" | "IMMEDIATE_OR_CANCEL" = "GOOD_TILL_CANCEL",
    clientOid?: string,
    postOnly = false,
  ): Promise<string | null> {
    try {
      const params: Record<string, unknown> = {
        instrument_name: instrument,
        side,
        type: "LIMIT",
        quantity: String(quantity),
        price: String(price),
        time_in_force: timeInForce,
      };
      if (clientOid) params["client_oid"] = clientOid;
      if (postOnly) params["exec_inst"] = ["POST_ONLY"];

      const result = await this.privatePost<{ order_id: string }>(
        "private/create-order",
        params,
      );
      return result.order_id ?? null;
    } catch (err) {
      logger.error({ err, instrument, side }, "Crypto.com createLimitOrder failed");
      return null;
    }
  }

  /**
   * Create a stop-loss order (conditional STOP_LOSS)
   */
  async createStopLossOrder(
    instrument: string,
    side: "BUY" | "SELL",
    quantity: number,
    triggerPrice: number,
    clientOid?: string,
  ): Promise<string | null> {
    try {
      const params: Record<string, unknown> = {
        instrument_name: instrument,
        side,
        type: "STOP_LOSS",
        quantity: String(quantity),
        trigger_price: String(triggerPrice),
      };
      if (clientOid) params["client_oid"] = clientOid;

      const result = await this.privatePost<{ order_id: string }>(
        "private/create-order",
        params,
      );
      return result.order_id ?? null;
    } catch (err) {
      logger.error({ err, instrument, side }, "Crypto.com createStopLossOrder failed");
      return null;
    }
  }

  /**
   * Create a take-profit order
   */
  async createTakeProfitOrder(
    instrument: string,
    side: "BUY" | "SELL",
    quantity: number,
    triggerPrice: number,
    clientOid?: string,
  ): Promise<string | null> {
    try {
      const params: Record<string, unknown> = {
        instrument_name: instrument,
        side,
        type: "TAKE_PROFIT",
        quantity: String(quantity),
        trigger_price: String(triggerPrice),
      };
      if (clientOid) params["client_oid"] = clientOid;

      const result = await this.privatePost<{ order_id: string }>(
        "private/create-order",
        params,
      );
      return result.order_id ?? null;
    } catch (err) {
      logger.error({ err, instrument, side }, "Crypto.com createTakeProfitOrder failed");
      return null;
    }
  }

  /**
   * Create OCO (One-Cancels-the-Other) order: stop-loss + take-profit together
   */
  async createOcoOrder(
    instrument: string,
    side: "BUY" | "SELL",
    quantity: number,
    limitPrice: number,
    stopPrice: number,
    clientOid?: string,
  ): Promise<string | null> {
    try {
      const params: Record<string, unknown> = {
        instrument_name: instrument,
        side,
        type: "LIMIT",
        quantity: String(quantity),
        price: String(limitPrice),
        trigger_price: String(stopPrice),
        contingency_type: "ONE_CANCELS_OTHER",
      };
      if (clientOid) params["client_oid"] = clientOid;

      const result = await this.privatePost<{ list_id: string }>(
        "private/create-order-list",
        params,
      );
      return result.list_id ?? null;
    } catch (err) {
      logger.error({ err, instrument }, "Crypto.com createOcoOrder failed");
      return null;
    }
  }

  /**
   * Cancel a single order
   */
  async cancelOrder(instrument: string, orderId: string): Promise<boolean> {
    try {
      await this.privatePost("private/cancel-order", {
        instrument_name: instrument,
        order_id: orderId,
      });
      return true;
    } catch (err) {
      logger.error({ err, instrument, orderId }, "Crypto.com cancelOrder failed");
      return false;
    }
  }

  /**
   * Cancel all open orders for an instrument (or all instruments)
   */
  async cancelAllOrders(instrument?: string): Promise<boolean> {
    try {
      const params: Record<string, unknown> = {};
      if (instrument) params["instrument_name"] = instrument;
      await this.privatePost("private/cancel-all-orders", params);
      return true;
    } catch (err) {
      logger.error({ err, instrument }, "Crypto.com cancelAllOrders failed");
      return false;
    }
  }

  /**
   * Close an open position (derivatives only — for spot use cancel+sell)
   */
  async closePosition(instrument: string, orderType: "MARKET" | "LIMIT" = "MARKET", price?: number): Promise<string | null> {
    try {
      const params: Record<string, unknown> = {
        instrument_name: instrument,
        type: orderType,
      };
      if (price) params["price"] = String(price);
      const result = await this.privatePost<{ order_id: string }>(
        "private/close-position",
        params,
      );
      return result.order_id ?? null;
    } catch (err) {
      logger.error({ err, instrument }, "Crypto.com closePosition failed");
      return null;
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(instrument?: string): Promise<CryptoOrder[]> {
    const params: Record<string, unknown> = {};
    if (instrument) params["instrument_name"] = instrument;
    const result = await this.privatePost<{ data: CryptoOrder[] }>(
      "private/get-open-orders",
      params,
    );
    return result.data ?? [];
  }

  /**
   * Get order detail by order_id
   */
  async getOrderDetail(orderId: string): Promise<CryptoOrder | null> {
    try {
      const result = await this.privatePost<{ order_info: CryptoOrder }>(
        "private/get-order-detail",
        { order_id: orderId },
      );
      return result.order_info ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get order history (filled, cancelled)
   */
  async getOrderHistory(
    instrument?: string,
    startTime?: number,
    endTime?: number,
    limit = 20,
  ): Promise<CryptoOrder[]> {
    const params: Record<string, unknown> = { page_size: limit };
    if (instrument) params["instrument_name"] = instrument;
    if (startTime) params["start_time"] = startTime;
    if (endTime) params["end_time"] = endTime;

    const result = await this.privatePost<{ data: CryptoOrder[] }>(
      "private/get-order-history",
      params,
    );
    return result.data ?? [];
  }

  /**
   * Get private trade history
   */
  async getPrivateTrades(
    instrument?: string,
    startTime?: number,
    endTime?: number,
    limit = 20,
  ): Promise<Array<{
    account_id: string;
    event_date: string;
    journal_type: string;
    side: "BUY" | "SELL";
    instrument_name: string;
    trade_quantity: string;
    trade_price: string;
    trade_fee: string;
    order_id: string;
    trade_id: string;
    create_time: number;
  }>> {
    const params: Record<string, unknown> = { page_size: limit };
    if (instrument) params["instrument_name"] = instrument;
    if (startTime) params["start_time"] = startTime;
    if (endTime) params["end_time"] = endTime;

    const result = await this.privatePost<{ data: unknown[] }>(
      "private/get-trades",
      params,
    );
    return (result.data as never[]) ?? [];
  }

  /**
   * Get fee rate
   */
  async getFeeRate(): Promise<{
    maker_fee_rate: string;
    taker_fee_rate: string;
    effective_maker_fee_rate: string;
    effective_taker_fee_rate: string;
  }> {
    const result = await this.privatePost<{
      maker_fee_rate: string;
      taker_fee_rate: string;
      effective_maker_fee_rate: string;
      effective_taker_fee_rate: string;
    }>("private/get-fee-rate", {});
    return result;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Get mid-price (bid+ask)/2 or last price
   */
  async getMidPrice(instrument: string): Promise<number | null> {
    try {
      const ticker = await this.getTicker(instrument);
      if (!ticker) return null;
      const ask = parseFloat(ticker.a ?? "0");
      const bid = parseFloat(ticker.b ?? "0");
      if (ask > 0 && bid > 0) return (ask + bid) / 2;
      return ask || bid || parseFloat(ticker.a) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get USD balance available
   */
  async getUsdBalance(): Promise<{ available: number; balance: number }> {
    try {
      const accounts = await getAccounts("USD", this);
      return accounts;
    } catch {
      try {
        const balances = await this.getUserBalance();
        const usd = balances.find(
          (b) => b.currency === "USD" || b.currency === "USDT" || b.currency === "USDC",
        );
        return {
          available: parseFloat(usd?.available ?? "0"),
          balance: parseFloat(usd?.balance ?? "0"),
        };
      } catch {
        return { available: 0, balance: 0 };
      }
    }
  }
}

async function getAccounts(
  currency: string,
  client: CryptoDotComClient,
): Promise<{ available: number; balance: number }> {
  const accounts = await client.getAccounts(currency);
  const acc = accounts.find((a) => a.currency === currency) ?? {
    available: "0",
    balance: "0",
  };
  return {
    available: parseFloat(acc.available),
    balance: parseFloat(acc.balance),
  };
}

// ─── Singleton factory ─────────────────────────────────────────────────────────

let _instance: CryptoDotComClient | null = null;

export function getCryptoDotComClient(apiKey?: string, apiSecret?: string): CryptoDotComClient {
  const key = apiKey ?? process.env.CRYPTOCOM_API_KEY ?? "";
  const secret = apiSecret ?? process.env.CRYPTOCOM_API_SECRET ?? "";
  if (!_instance || apiKey || apiSecret) {
    _instance = new CryptoDotComClient(key, secret);
  }
  return _instance;
}
