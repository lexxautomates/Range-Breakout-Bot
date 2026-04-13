import { logger } from "./logger.js";
import { alpaca, apiKey as alpacaKey, apiSecret as alpacaSecret, dataBaseUrl } from "./alpaca.js";

export type BrokerName = "alpaca" | "ibkr" | "cryptocom";

export interface BrokerCredentials {
  broker: BrokerName;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
}

export interface AccountInfo {
  equity: number;
  cash: number;
  buyingPower: number;
}

export interface IBroker {
  getAccount(): Promise<AccountInfo>;
  placeMarketOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<string | null>;
  closePosition(symbol: string): Promise<void>;
  getPrice(symbol: string): Promise<number | null>;
}

// ─── Alpaca Broker ────────────────────────────────────────────────────────────

class AlpacaBroker implements IBroker {
  async getAccount(): Promise<AccountInfo> {
    const acct = (await alpaca.getAccount()) as {
      equity: string;
      cash: string;
      buying_power: string;
    };
    return {
      equity: parseFloat(acct.equity),
      cash: parseFloat(acct.cash),
      buyingPower: parseFloat(acct.buying_power),
    };
  }

  async placeMarketOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<string | null> {
    try {
      const order = (await alpaca.createOrder({
        symbol,
        qty,
        side,
        type: "market",
        time_in_force: "day",
      })) as { id: string };
      return order.id;
    } catch (err) {
      logger.error({ err, broker: "alpaca" }, "Failed to place Alpaca order");
      return null;
    }
  }

  async closePosition(symbol: string): Promise<void> {
    try {
      await alpaca.closePosition(symbol);
    } catch (err) {
      logger.error({ err, broker: "alpaca" }, "Failed to close Alpaca position");
    }
  }

  async getPrice(symbol: string): Promise<number | null> {
    try {
      const url = `${dataBaseUrl}/v2/stocks/${symbol}/quotes/latest?feed=iex`;
      const resp = await fetch(url, {
        headers: {
          "APCA-API-KEY-ID": alpacaKey,
          "APCA-API-SECRET-KEY": alpacaSecret,
        },
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { quote?: { ap?: number; bp?: number } };
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
}

// ─── IBKR Broker (REST Gateway via IB Gateway / TWS API proxy) ───────────────
// Requires IB Gateway or TWS running locally with a REST proxy (e.g. ib_insync REST bridge
// or the official IBKR Client Portal Web API https://interactivebrokers.github.io/cpwebapi/)

class IbkrBroker implements IBroker {
  private baseUrl: string;
  private accountId: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.IBKR_BASE_URL || "https://localhost:5000/v1/api";
  }

  private async fetchIbkr<T>(path: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!resp.ok) {
      throw new Error(`IBKR API error ${resp.status}: ${await resp.text()}`);
    }
    return resp.json() as Promise<T>;
  }

  private async getAccountId(): Promise<string> {
    if (this.accountId) return this.accountId;
    const accounts = await this.fetchIbkr<Array<{ accountId: string }>>("/portfolio/accounts");
    if (!accounts || accounts.length === 0) throw new Error("No IBKR accounts found");
    this.accountId = accounts[0]!.accountId;
    return this.accountId;
  }

  async getAccount(): Promise<AccountInfo> {
    const acctId = await this.getAccountId();
    const summary = await this.fetchIbkr<Record<string, { amount: number }>>(
      `/portfolio/${acctId}/summary`,
    );
    return {
      equity: summary["netliquidationvalue"]?.amount ?? 0,
      cash: summary["totalcashvalue"]?.amount ?? 0,
      buyingPower: summary["buyingpower"]?.amount ?? 0,
    };
  }

  async placeMarketOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<string | null> {
    try {
      const acctId = await this.getAccountId();
      const orders = await this.fetchIbkr<Array<{ orderId: string }>>(
        `/iserver/account/${acctId}/orders`,
        {
          method: "POST",
          body: JSON.stringify({
            orders: [
              {
                conid: symbol,
                orderType: "MKT",
                side: side === "buy" ? "BUY" : "SELL",
                quantity: qty,
                tif: "DAY",
              },
            ],
          }),
        },
      );
      return orders[0]?.orderId ?? null;
    } catch (err) {
      logger.error({ err, broker: "ibkr" }, "Failed to place IBKR order");
      return null;
    }
  }

  async closePosition(symbol: string): Promise<void> {
    try {
      const acctId = await this.getAccountId();
      await this.fetchIbkr(`/portfolio/${acctId}/positions/close`, {
        method: "POST",
        body: JSON.stringify({ symbol }),
      });
    } catch (err) {
      logger.error({ err, broker: "ibkr" }, "Failed to close IBKR position");
    }
  }

  async getPrice(symbol: string): Promise<number | null> {
    try {
      const data = await this.fetchIbkr<Array<{ last_price: number }>>(
        `/iserver/marketdata/snapshot?conids=${symbol}&fields=31`,
      );
      return data[0]?.last_price ?? null;
    } catch {
      return null;
    }
  }
}

// ─── Crypto.com Broker ────────────────────────────────────────────────────────
// Uses the Crypto.com Exchange API v1 (spot trading)
// Docs: https://exchange-docs.crypto.com/exchange/v1/rest-ws/index.html

class CryptoDotComBroker implements IBroker {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(apiKey?: string, apiSecret?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.CRYPTOCOM_API_KEY || "";
    this.apiSecret = apiSecret || process.env.CRYPTOCOM_API_SECRET || "";
    this.baseUrl = baseUrl || "https://api.crypto.com/exchange/v1";
  }

  private async sign(method: string, id: number, params: Record<string, unknown>): Promise<string> {
    const { createHmac } = await import("crypto");
    const paramString = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
    const sigPayload = `${method}${id}${this.apiKey}${paramString}${Date.now()}`;
    return createHmac("sha256", this.apiSecret).update(sigPayload).digest("hex");
  }

  private async privateRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = Date.now();
    const nonce = Date.now();
    const sig = await this.sign(method, id, params);
    const body = {
      id,
      method,
      params,
      api_key: this.apiKey,
      sig,
      nonce,
    };
    const resp = await fetch(`${this.baseUrl}/private/${method.replace("private/", "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Crypto.com error ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as { result: T; code: number };
    if (data.code !== 0) throw new Error(`Crypto.com API error code ${data.code}`);
    return data.result;
  }

  async getAccount(): Promise<AccountInfo> {
    const result = await this.privateRequest<{
      data: { accounts: Array<{ currency: string; available: number; balance: number }> };
    }>("private/get-accounts", {});
    const usd = result.data.accounts.find((a) => a.currency === "USD") ?? {
      available: 0,
      balance: 0,
    };
    return {
      equity: usd.balance,
      cash: usd.available,
      buyingPower: usd.available,
    };
  }

  async placeMarketOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<string | null> {
    try {
      const result = await this.privateRequest<{ order_id: string }>("private/create-order", {
        instrument_name: symbol,
        side: side === "buy" ? "BUY" : "SELL",
        type: "MARKET",
        quantity: qty,
      });
      return result.order_id ?? null;
    } catch (err) {
      logger.error({ err, broker: "cryptocom" }, "Failed to place Crypto.com order");
      return null;
    }
  }

  async closePosition(symbol: string): Promise<void> {
    try {
      await this.privateRequest("private/close-position", { instrument_name: symbol });
    } catch (err) {
      logger.error({ err, broker: "cryptocom" }, "Failed to close Crypto.com position");
    }
  }

  async getPrice(symbol: string): Promise<number | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/public/get-ticker?instrument_name=${symbol}`);
      if (!resp.ok) return null;
      const data = (await resp.json()) as { result: { data: Array<{ a: string; b: string }> } };
      const ticker = data.result?.data?.[0];
      if (!ticker) return null;
      const ask = parseFloat(ticker.a ?? "0");
      const bid = parseFloat(ticker.b ?? "0");
      if (ask > 0 && bid > 0) return (ask + bid) / 2;
      return ask || bid || null;
    } catch {
      return null;
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBroker(creds?: BrokerCredentials): IBroker {
  if (!creds || creds.broker === "alpaca") {
    return new AlpacaBroker();
  }
  if (creds.broker === "ibkr") {
    return new IbkrBroker(creds.baseUrl);
  }
  if (creds.broker === "cryptocom") {
    return new CryptoDotComBroker(creds.apiKey, creds.apiSecret, creds.baseUrl);
  }
  logger.warn({ broker: creds.broker }, "Unknown broker, falling back to Alpaca");
  return new AlpacaBroker();
}
