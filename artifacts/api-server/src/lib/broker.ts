import { logger } from "./logger.js";
import { alpaca, apiKey as alpacaKey, apiSecret as alpacaSecret, dataBaseUrl } from "./alpaca.js";
import { CryptoDotComClient } from "./cryptocom.js";

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
// Uses CryptoDotComClient for full Exchange v1 API support

class CryptoDotComBroker implements IBroker {
  private client: CryptoDotComClient;

  constructor(apiKey?: string, apiSecret?: string, baseUrl?: string) {
    this.client = new CryptoDotComClient(
      apiKey || process.env.CRYPTOCOM_API_KEY || "",
      apiSecret || process.env.CRYPTOCOM_API_SECRET || "",
      baseUrl,
    );
  }

  async getAccount(): Promise<AccountInfo> {
    try {
      const accounts = await this.client.getAccounts("USD");
      const usd = accounts.find((a) => a.currency === "USD") ?? {
        available: "0",
        balance: "0",
      };
      const available = parseFloat(usd.available);
      const balance = parseFloat(usd.balance);
      return { equity: balance, cash: available, buyingPower: available };
    } catch {
      try {
        const balances = await this.client.getUserBalance();
        const usd = balances.find(
          (b) => b.currency === "USD" || b.currency === "USDT" || b.currency === "USDC",
        ) ?? { available: "0", balance: "0" };
        const available = parseFloat(usd.available);
        const balance = parseFloat(usd.balance);
        return { equity: balance, cash: available, buyingPower: available };
      } catch {
        return { equity: 0, cash: 0, buyingPower: 0 };
      }
    }
  }

  async placeMarketOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<string | null> {
    return this.client.createMarketOrder(symbol, side === "buy" ? "BUY" : "SELL", qty);
  }

  async closePosition(symbol: string): Promise<void> {
    try {
      await this.client.cancelAllOrders(symbol);
      const positions = await this.client.getPositions(symbol);
      const pos = positions.find((p) => p.instrument_name === symbol);
      if (pos) {
        const qty = Math.abs(parseFloat(pos.quantity));
        if (qty > 0) {
          const side = parseFloat(pos.quantity) > 0 ? "SELL" : "BUY";
          await this.client.createMarketOrder(symbol, side, qty);
        }
      }
    } catch (err) {
      logger.error({ err, broker: "cryptocom", symbol }, "Failed to close Crypto.com position");
    }
  }

  async getPrice(symbol: string): Promise<number | null> {
    return this.client.getMidPrice(symbol);
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
