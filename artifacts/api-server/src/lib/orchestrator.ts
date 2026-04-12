import { startChildBot, stopAllChildBots, listChildBots, spawnOffspring } from "./botEngine.js";
import { runScan, getLastScanResult } from "./scanner.js";
import { getGlobalConfig } from "./botEngine.js";
import { logger } from "./logger.js";

let scheduledScanTimer: ReturnType<typeof setInterval> | null = null;

// Run morning scan and auto-start top N bots
// Guard: only starts if autoStartTopN > 0 AND no bots are currently running
export async function runMorningScanAndStart(): Promise<void> {
  const config = await getGlobalConfig();
  const topN = config.autoStartTopN ?? 0;

  if (topN <= 0) {
    logger.info("autoStartTopN is 0 — skipping auto-start");
    return;
  }

  const existing = listChildBots();
  if (existing.length > 0) {
    logger.info(
      { existingCount: existing.length },
      "Bots already running — skipping auto-start (will not disrupt active trading)",
    );
    return;
  }

  logger.info({ topN }, "Running morning scan for auto-start (no bots currently running)");

  const scanResult = await runScan(undefined, topN);
  const topSymbols = scanResult.topN.map((c) => c.symbol);

  for (const symbol of topSymbols) {
    try {
      await startChildBot(symbol);
      logger.info({ symbol }, "Auto-started child bot from morning scan");
    } catch (err) {
      logger.error({ err, symbol }, "Failed to auto-start child bot");
    }
  }
}

// Force auto-start: stop existing bots and start fresh from scan
// (used only when explicitly triggered via /scanner/auto-start with force=true or directly)
export async function forceAutoStartFromScan(): Promise<void> {
  const config = await getGlobalConfig();
  const topN = config.autoStartTopN <= 0 ? 5 : config.autoStartTopN;

  const existing = listChildBots();
  if (existing.length > 0) {
    logger.info({ count: existing.length }, "Stopping existing bots for forced auto-start");
    await stopAllChildBots();
  }

  const scanResult = await runScan(undefined, topN);
  const topSymbols = scanResult.topN.map((c) => c.symbol);

  for (const symbol of topSymbols) {
    try {
      await startChildBot(symbol);
      logger.info({ symbol }, "Force auto-started child bot from scan");
    } catch (err) {
      logger.error({ err, symbol }, "Failed to force auto-start child bot");
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

// Spawn offspring from the top N performing bots (by avgRMultiple)
// minTrades: only consider bots that have completed at least this many trades
export async function spawnTopPerformers(
  topN = 1,
  minTrades = 3,
): Promise<{ spawned: string[]; skipped: string[] }> {
  const bots = listChildBots();
  const eligible = bots
    .filter((b) => b.totalTrades >= minTrades && b.avgRMultiple > 0)
    .sort((a, b) => b.avgRMultiple - a.avgRMultiple)
    .slice(0, topN);

  const spawned: string[] = [];
  const skipped: string[] = [];

  for (const parent of eligible) {
    const offspring = await spawnOffspring(parent.id);
    if (offspring) {
      spawned.push(offspring.id);
      logger.info(
        { parentId: parent.id, offspringId: offspring.id, parentAvgR: parent.avgRMultiple },
        "Orchestrator spawned offspring from top performer",
      );
    } else {
      skipped.push(parent.id);
    }
  }

  if (eligible.length === 0) {
    logger.info(
      { minTrades, botsCount: bots.length },
      "No eligible bots for orchestrator spawn (need more trades or positive avgR)",
    );
  }

  return { spawned, skipped };
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
