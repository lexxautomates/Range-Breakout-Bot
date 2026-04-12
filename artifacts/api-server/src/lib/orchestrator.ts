import { startChildBot, stopAllChildBots, listChildBots } from "./botEngine.js";
import { runScan, getLastScanResult } from "./scanner.js";
import { getGlobalConfig } from "./botEngine.js";
import { logger } from "./logger.js";

let scheduledScanTimer: ReturnType<typeof setInterval> | null = null;

// Run morning scan and auto-start top N bots
export async function runMorningScanAndStart(): Promise<void> {
  const config = await getGlobalConfig();
  const topN = config.autoStartTopN ?? 0;

  if (topN <= 0) {
    logger.info("autoStartTopN is 0 — skipping auto-start");
    return;
  }

  logger.info({ topN }, "Running morning scan for auto-start");

  const scanResult = await runScan(undefined, topN);
  const topSymbols = scanResult.topN.map((c) => c.symbol);

  // Stop any existing bots before starting fresh
  const existing = listChildBots();
  if (existing.length > 0) {
    logger.info({ count: existing.length }, "Stopping existing bots before auto-start");
    await stopAllChildBots();
  }

  // Start one bot per top symbol
  for (const symbol of topSymbols) {
    try {
      await startChildBot(symbol);
      logger.info({ symbol }, "Auto-started child bot from scan");
    } catch (err) {
      logger.error({ err, symbol }, "Failed to auto-start child bot");
    }
  }
}

// Schedule daily morning scan at 9:25 AM ET
function scheduleNextScan(): void {
  if (scheduledScanTimer) {
    clearInterval(scheduledScanTimer);
    scheduledScanTimer = null;
  }

  // Check every minute whether it's 9:25 AM ET
  scheduledScanTimer = setInterval(async () => {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const h = et.getHours();
    const m = et.getMinutes();

    // 9:25 AM ET ± 30 seconds (run once in the minute 9:25)
    if (h === 9 && m === 25) {
      const lastScan = getLastScanResult();
      const today = new Date().toISOString().split("T")[0]!;

      // Only run once per day
      if (!lastScan || !lastScan.scannedAt.startsWith(today)) {
        logger.info("9:25 AM ET — triggering scheduled morning scan");
        try {
          await runMorningScanAndStart();
        } catch (err) {
          logger.error({ err }, "Scheduled morning scan failed");
        }
      }
    }
  }, 60000);

  logger.info("Morning scan scheduler started (9:25 AM ET daily)");
}

export function startOrchestrator(): void {
  scheduleNextScan();
  logger.info("Orchestrator started");
}

export function stopOrchestrator(): void {
  if (scheduledScanTimer) {
    clearInterval(scheduledScanTimer);
    scheduledScanTimer = null;
  }
  logger.info("Orchestrator stopped");
}
