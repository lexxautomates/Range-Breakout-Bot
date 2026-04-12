import Alpaca from "@alpacahq/alpaca-trade-api";

const apiKey = process.env.ALPACA_API_KEY;
const apiSecret = process.env.ALPACA_API_SECRET;
const baseUrl = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
const dataBaseUrl = process.env.ALPACA_DATA_URL ?? "https://data.alpaca.markets";

if (!apiKey || !apiSecret) {
  throw new Error("ALPACA_API_KEY and ALPACA_API_SECRET must be set");
}

export const alpaca = new Alpaca({
  keyId: apiKey,
  secretKey: apiSecret,
  paper: true,
  baseUrl,
});

export { baseUrl, dataBaseUrl, apiKey, apiSecret };
