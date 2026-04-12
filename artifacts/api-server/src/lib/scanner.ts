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
  score: number;
  rank: number;
  isTopN: boolean;
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
  "TLT", "HYG",
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
      const rawData = await resp.json();
      // Handle both {SYMBOL:{...}} and {snapshots:{SYMBOL:{...}}} response shapes
      const data: Record<string, AlpacaSnapshot> =
        (rawData as { snapshots?: Record<string, AlpacaSnapshot> }).snapshots ??
        (rawData as Record<string, AlpacaSnapshot>);
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
  minRelativeVolume = 0.0,
): Promise<ScanResult> {
  logger.info({ symbolCount: symbolUniverse.length }, "Running morning scan");

  const snapshots = await fetchSnapshots(symbolUniverse);

  const candidates: ScanCandidate[] = [];

  for (const [symbol, snap] of Object.entries(snapshots)) {
    const prevClose = snap.prevDailyBar?.c;
    const open = snap.dailyBar?.o;
    const volume = snap.dailyBar?.v ?? 0;

    if (!prevClose || !open || prevClose === 0) continue;

    const ask = snap.latestQuote?.ap ?? 0;
    const bid = snap.latestQuote?.bp ?? 0;
    const currentPrice =
      snap.latestTrade?.p ??
      (ask > 0 && bid > 0 ? (ask + bid) / 2 : snap.dailyBar?.c ?? open);

    const gapPercent = ((open - prevClose) / prevClose) * 100;
    const absGap = Math.abs(gapPercent);

    if (absGap < minGapPercent) continue;

    const avgVolume = snap.prevDailyBar?.v ?? 1;
    const relativeVolume = avgVolume > 0 ? volume / avgVolume : 0;

    if (relativeVolume < minRelativeVolume) continue;

    // Combined score: absolute gap % weighted by relative volume
    // Higher gap with higher volume = better ORB candidate
    const score = absGap * Math.max(relativeVolume, 0.1);

    const recommended = absGap >= 1.0 && relativeVolume >= 1.2;

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
      score,
      rank: 0,
      isTopN: false,
      recommended,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Assign rank and top-N marker after sorting
  candidates.forEach((c, i) => {
    c.rank = i + 1;
    c.isTopN = i < topN;
  });

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
