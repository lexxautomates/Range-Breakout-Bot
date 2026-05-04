import app from "./app.js";
import { logger } from "./lib/logger.js";
import { ensureDefaultConfig } from "./lib/botEngine.js";
import { startOrchestrator } from "./lib/orchestrator.js";

const rawPort = process.env["PORT"];
const host = process.env["HOST"] || "127.0.0.1";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, host, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  try {
    await ensureDefaultConfig();
    logger.info("Default bot config ensured");
  } catch (e) {
    logger.error({ err: e }, "Failed to ensure default config");
  }

  startOrchestrator();

  logger.info({ host, port }, "Server listening");
});
