import { apiKey, apiSecret, dataBaseUrl } from "./alpaca.js";
import { logger } from "./logger.js";

export interface ScanCandidate {
  symbol: string;
  prevClose: number;
  open: number;
  currentPrice: number;
  gapPercent: number;
  gapDirection: "up" | "down";
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  recommended: boolean;
}

export interface ScanResult {
  scannedAt: string;
  candidates: ScanCandidate[];
  topN: ScanCandidate[];
}

// Default universe of liquid, high-volume symbols to scan
const DEFAULT_UNIVERSE = [
  "SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
  "META", "TSLA", "AMD", "INTC", "NFLX", "BABA", "TSM", "AVGO", "CRM",
  "ORCL", "ADBE", "PYPL", "SQ", "SHOP", "SNAP", "UBER", "LYFT", "COIN",
  "MARA", "RIOT", "SOFI", "PLTR", "RBLX", "HOOD", "RIVN", "LCID", "NIO",
  "XPEV", "LI", "F", "GM", "FORD", "BAC", "JPM", "GS", "MS", "WFC",
  "C", "XLF", "XLE", "XLK", "XLV", "XLI", "XLU", "GLD", "SLV", "USO",
  "TLT", "HYG", "VIX",
];

type AlpacaSnapshot = {
  latestTrade?: { p: number };
  latestQuote?: { ap: number; bp: number };
  minuteBar?: { o: number; h: number; l: number; c: number; v: number };
  dailyBar?: { o: number; h: number; l: number; c: number; v: number };
  prevDailyBar?: { o: number; h: number; l: number; c: number; v: number };
};

async function fetchSnapshots(
  symbols: string[],
): Promise<Record<string, AlpacaSnapshot>> {
  const chunkSize = 100;
  const result: Record<string, AlpacaSnapshot> = {};

  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const url = `${dataBaseUrl}/v2/stocks/snapshots?symbols=${chunk.join(",")}&feed=iex`;
    try {
      const resp = await fetch(url, {
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": apiSecret,
        },
      });
      if (!resp.ok) {
        logger.warn({ status: resp.status }, "Snapshot fetch failed for chunk");
        continue;
      }
      const data = await resp.json() as Record<string, AlpacaSnapshot>;
      Object.assign(result, data);
    } catch (err) {
      logger.error({ err }, "Snapshot fetch error");
    }
  }

  return result;
}

let lastScanResult: ScanResult | null = null;

export function getLastScanResult(): ScanResult | null {
  return lastScanResult;
}

export async function runScan(
  symbolUniverse: string[] = DEFAULT_UNIVERSE,
  topN = 10,
  minGapPercent = 0.5,
  minRelativeVolume = 1.0,
): Promise<ScanResult> {
  logger.info({ symbolCount: symbolUniverse.length }, "Running morning scan");

  const snapshots = await fetchSnapshots(symbolUniverse);

  const candidates: ScanCandidate[] = [];

  for (const [symbol, snap] of Object.entries(snapshots)) {
    const prevClose = snap.prevDailyBar?.c;
    const open = snap.dailyBar?.o;
    const volume = snap.dailyBar?.v ?? 0;

    if (!prevClose || !open || prevClose === 0) continue;

    // Current price: prefer latest trade, fall back to last bar close
    const ask = snap.latestQuote?.ap ?? 0;
    const bid = snap.latestQuote?.bp ?? 0;
    const currentPrice =
      snap.latestTrade?.p ??
      (ask > 0 && bid > 0 ? (ask + bid) / 2 : snap.dailyBar?.c ?? open);

    const gapPercent = ((open - prevClose) / prevClose) * 100;
    const absGap = Math.abs(gapPercent);

    if (absGap < minGapPercent) continue;

    // Average volume: we use today's dollar volume as a proxy (real avg needs historical bars)
    // We estimate: avgVolume ≈ prevDailyBar volume
    const avgVolume = snap.prevDailyBar?.v ?? 1;
    const relativeVolume = avgVolume > 0 ? volume / avgVolume : 0;

    const recommended = absGap >= 1.0 && relativeVolume >= minRelativeVolume;

    candidates.push({
      symbol,
      prevClose,
      open,
      currentPrice,
      gapPercent,
      gapDirection: gapPercent >= 0 ? "up" : "down",
      volume,
      avgVolume,
      relativeVolume,
      recommended,
    });
  }

  // Sort by absolute gap % descending
  candidates.sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent));

  const topNResult = candidates.slice(0, topN);

  const result: ScanResult = {
    scannedAt: new Date().toISOString(),
    candidates,
    topN: topNResult,
  };

  lastScanResult = result;
  logger.info(
    { found: candidates.length, topN: topNResult.length },
    "Morning scan complete",
  );

  return result;
}
